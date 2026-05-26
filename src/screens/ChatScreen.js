import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StatusBar,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Avatar } from '../components/Avatar';
import { Colors } from '../constants/colors';
import { QUICK_QUESTIONS, QUICK_QUESTIONS_BY_ROLE, SAMPLE_MESSAGES } from '../constants/data';
import { openaiService, OpenAIAuthError, OpenAIRateLimitError } from '../services/openaiService';
import { useSettings } from '../context/SettingsContext';
import { detectCrisis, CRISIS_RESPONSE_TEXT, CRISIS_CONTACTS, callNumber } from '../utils/crisisDetector';
import { logFeedback } from '../utils/feedbackLogger';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { tts } from '../lib/tts/ttsService';

const MESSAGES_KEY = 'chat_messages_v1';
const MAX_PERSISTED = 100;

const ERROR_MESSAGES = {
  auth: 'Invalid API key — update it in Settings',
  ratelimit: 'Rate limit reached — wait a moment and try again',
  network: 'Connection error — check your internet connection',
};

// ─── Typing indicator ─────────────────────────────────────────────────────────
const TypingIndicator = ({ anim, bubbleStyle }) => (
  <View style={styles.typingRow}>
    <View style={[styles.typingBubble, bubbleStyle]}>
      {[0, 1, 2].map(i => (
        <Animated.View
          key={i}
          style={[styles.typingDot, {
            opacity: anim.interpolate({
              inputRange: [0, 0.33, 0.66, 1],
              outputRange: i === 0 ? [0.3, 1, 0.3, 0.3]
                         : i === 1 ? [0.3, 0.3, 1, 0.3]
                         : [0.3, 0.3, 0.3, 1],
            }),
          }]}
        />
      ))}
    </View>
  </View>
);

// ─── Persist helpers ──────────────────────────────────────────────────────────
const persistMessages = async (internalMsgs) => {
  try {
    const toStore = internalMsgs.slice(-MAX_PERSISTED);
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(toStore));
  } catch { /* non-critical */ }
};

const loadPersistedMessages = async () => {
  try {
    const raw = await AsyncStorage.getItem(MESSAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [];
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export const ChatScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { textScale, autoPlayResponses, colors, userRole, simpleLanguage } = useSettings();
  const messageListRef = useRef(null);
  // Internal message list (oldest first)
  const [internalMessages, setInternalMessages] = useState(SAMPLE_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState(null); // null | 'auth' | 'ratelimit' | 'network'
  const [messageFeedback, setMessageFeedback] = useState({}); // messageId → 'up' | 'down'
  const initialMessageSent = useRef(false);
  const typingAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef(null);

  // ── Startup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Load persisted conversation history
      const saved = await loadPersistedMessages();
      if (saved.length > 0) {
        setInternalMessages(saved);
      }

      // Check API key
      const hasKey = await openaiService.hasApiKey();
      if (!hasKey) {
        setApiKeyMissing(true);
        return;
      }

      // Init knowledge base (embeddings)
      setIsInitializing(true);
      try {
        await openaiService.initKnowledgeBase();
      } catch (e) {
        if (e instanceof OpenAIAuthError) {
          setApiKeyMissing(true);
        } else {
          setError('network');
        }
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, []);

  // Unload sound when screen unmounts
  useEffect(() => {
    return () => { soundRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  // Re-check API key when screen comes back into focus (e.g. after saving in Profile)
  // Also reload messages in case voice conversation added new ones
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      // Reload messages in case voice conversation added new ones
      const saved = await loadPersistedMessages();
      if (saved.length > 0) {
        setInternalMessages(saved);
      }

      if (apiKeyMissing) {
        const hasKey = await openaiService.hasApiKey();
        if (hasKey) {
          setApiKeyMissing(false);
          setError(null);
          setIsInitializing(true);
          try {
            await openaiService.initKnowledgeBase();
          } catch {
            setError('network');
          } finally {
            setIsInitializing(false);
          }
        }
      }
    });
    return unsubscribe;
  }, [navigation, apiKeyMissing]);

  // Handle initial message from route params (e.g. quick question from HomeScreen)
  useEffect(() => {
    if (route.params?.initialMessage && !initialMessageSent.current) {
      initialMessageSent.current = true;
      // Small delay to let the screen settle before sending
      setTimeout(() => sendMessage(route.params.initialMessage), 600);
    }
  }, []);

  // ── Typing animation ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isTyping) {
      Animated.loop(
        Animated.timing(typingAnim, { toValue: 1, duration: 900, useNativeDriver: false })
      ).start();
    } else {
      typingAnim.stopAnimation();
      typingAnim.setValue(0);
    }
  }, [isTyping]);

  useEffect(() => {
    requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({ animated: true });
    });
  }, [internalMessages.length, isTyping]);

  // ── Send message ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const trimmed = (text ?? '').trim();
    if (!trimmed || apiKeyMissing || isInitializing) return;

    setError(null);

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
      sources: [],
    };

    setInternalMessages(prev => {
      const updated = [...prev, userMsg];
      persistMessages(updated);
      return updated;
    });
    setInputText('');
    setIsTyping(true);

    // ── Crisis check ──────────────────────────────────────────────────────────
    // Bypass the LLM entirely — insert a hardcoded safety card, no API call.
    if (detectCrisis(trimmed)) {
      setIsTyping(false);
      const crisisMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        isCrisis: true,
        text: CRISIS_RESPONSE_TEXT,
        sources: [],
        timestamp: new Date().toISOString(),
      };
      setInternalMessages(prev => {
        const updated = [...prev, crisisMsg];
        persistMessages(updated);
        return updated;
      });
      return;
    }

    // Build history for the RAG context window (last 6 messages)
    const history = internalMessages.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    try {
      const response = await openaiService.chat(trimmed, history, { userRole, simpleLanguage });
      setIsTyping(false);
      setIsSpeaking(true);

      const aiMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: response.text,
        sources: response.sources,
        timestamp: new Date().toISOString(),
      };

      setInternalMessages(prev => {
        const updated = [...prev, aiMsg];
        persistMessages(updated);
        return updated;
      });

      if (autoPlayResponses) {
        tts(response.text).then(async ({ audio }) => {
          try {
            await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
            const base64 = audio.replace('data:audio/mpeg;base64,', '');
            const tempPath = `${FileSystem.cacheDirectory}aria_chat_${Date.now()}.mp3`;
            await FileSystem.writeAsStringAsync(tempPath, base64, { encoding: FileSystem.EncodingType.Base64 });
            const { sound } = await Audio.Sound.createAsync({ uri: tempPath });
            soundRef.current = sound;
            await sound.playAsync();
            sound.setOnPlaybackStatusUpdate(status => {
              if (status.didJustFinish) {
                sound.unloadAsync().catch(() => {});
                FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
                setIsSpeaking(false);
              }
            });
          } catch { /* non-critical — TTS failure should not affect chat UX */ }
        }).catch(() => {});
      }

      if (!autoPlayResponses) {
        setTimeout(() => setIsSpeaking(false), 3000);
      }
    } catch (e) {
      setIsTyping(false);
      if (e instanceof OpenAIAuthError) {
        setError('auth');
        setApiKeyMissing(true);
      } else if (e instanceof OpenAIRateLimitError) {
        setError('ratelimit');
      } else {
        setError('network');
      }
    }
  }, [internalMessages, apiKeyMissing, isInitializing, autoPlayResponses]);

  // ── Custom renderers ──────────────────────────────────────────────────────────

  const renderMessageBubble = (message) => {
    // ── Crisis card ────────────────────────────────────────────────────────────
    if (message.isCrisis) {
      return (
        <View style={styles.crisisCard}>
          <View style={styles.crisisHeader}>
            <MaterialCommunityIcons name="alert-circle" size={18} color="#D4375D" />
            <Text style={[styles.crisisTitle, { fontSize: 14 * textScale }]}>
              Urgent support available
            </Text>
          </View>
          <Text style={[styles.crisisBody, { fontSize: 14 * textScale }]}>
            {message.text}
          </Text>
          <View style={styles.crisisContacts}>
            {CRISIS_CONTACTS.map(c => (
              <TouchableOpacity
                key={c.label}
                style={[styles.crisisContactBtn, { borderColor: c.color }]}
                onPress={() => callNumber(c.number)}
                accessibilityLabel={`Call ${c.label}: ${c.number}`}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="phone" size={15} color={c.color} />
                <View style={styles.crisisContactText}>
                  <Text style={[styles.crisisContactLabel, { color: c.color, fontSize: 13 * textScale }]}>
                    {c.label}
                  </Text>
                  <Text style={[styles.crisisContactSub, { fontSize: 11 * textScale }]}>
                    {c.sublabel}
                  </Text>
                  <Text style={[styles.crisisContactNumber, { color: c.color, fontSize: 13 * textScale }]}>
                    {c.number}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    const isUser = message.role === 'user';
    const sources = message.sources ?? [];
    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAria]}>
        <View style={[styles.messageBubble, isUser ? styles.messageBubbleUser : [styles.messageBubbleAria, { backgroundColor: colors.border }]]}>
          <Text style={[
            styles.messageText,
            isUser ? styles.messageTextUser : [styles.messageTextAria, { color: colors.textPrimary }],
            { fontSize: 16 * textScale, lineHeight: 22 * textScale },
          ]}>
            {message.text}
          </Text>
        </View>

        {!isUser && sources.length > 0 && (
          <View style={styles.sourcesContainer}>
            <MaterialCommunityIcons name="book-open-outline" size={12} color={Colors.primary} />
            <View style={styles.sourcesList}>
              {sources.map((s, i) => {
                const isObj = typeof s === 'object' && s !== null;
                const label = isObj ? (s.org ?? s.title) : s;
                const url = isObj ? s.url : null;
                return (
                  <Text
                    key={i}
                    style={[styles.sourceText, url && styles.sourceLink]}
                    onPress={url ? () => Linking.openURL(url) : undefined}
                  >
                    · {label}
                  </Text>
                );
              })}
            </View>
          </View>
        )}

        {/* Feedback — thumbs up/down on assistant messages */}
        {!isUser && (
          <View style={styles.feedbackRow}>
            {['up', 'down'].map(dir => {
              const given = messageFeedback[message.id];
              const isActive = given === dir;
              return (
                <TouchableOpacity
                  key={dir}
                  style={[styles.feedbackBtn, isActive && styles.feedbackBtnActive]}
                  onPress={() => {
                    if (given) return;
                    setMessageFeedback(prev => ({ ...prev, [message.id]: dir }));
                    const idx = internalMessages.findIndex(m => m.id === message.id);
                    const prevUser = internalMessages.slice(0, idx).reverse().find(m => m.role === 'user');
                    logFeedback({
                      messageId: message.id,
                      query: prevUser?.text ?? '',
                      answer: message.text,
                      feedback: dir,
                    });
                  }}
                  accessibilityLabel={dir === 'up' ? 'Mark helpful' : 'Mark not helpful'}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons
                    name={dir === 'up' ? 'thumb-up-outline' : 'thumb-down-outline'}
                    size={14}
                    color={isActive ? (dir === 'up' ? Colors.success : Colors.error) : '#C7C7CC'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderMessageItem = ({ item }) => renderMessageBubble(item);

  const renderChatEmpty = () => (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="chat-outline" size={48} color={Colors.border} />
      <Text style={[styles.emptyText, { fontSize: 15 * textScale }]}>Ask Aria anything about dementia care</Text>
    </View>
  );

  const renderFooter = () => {
    if (!isTyping) return null;
    return <TypingIndicator anim={typingAnim} bubbleStyle={{ backgroundColor: colors.border }} />;
  };

  // ── Input bar (rendered outside GiftedChat so layout is never clipped) ────────
  const inputBar = (
    <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {isInitializing ? (
        <View style={styles.initRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.initText}>Preparing knowledge base…</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {(QUICK_QUESTIONS_BY_ROLE[userRole] ?? QUICK_QUESTIONS).slice(0, 5).map((chip, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => sendMessage(chip)}
              accessibilityLabel={chip}
            >
              <Text style={[styles.chipText, { color: colors.primary }]}>{chip}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.error} />
          <Text style={styles.errorText}>{ERROR_MESSAGES[error]}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <MaterialCommunityIcons name="close" size={16} color={Colors.error} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        {!inputText.trim() && (
          <TouchableOpacity
            style={styles.roundBtn}
            onPress={() => navigation.navigate('Voice')}
            accessibilityLabel="Voice input"
          >
            <MaterialCommunityIcons name="microphone" size={20} color={Colors.primary} />
          </TouchableOpacity>
        )}

        <View style={[styles.pillWrap, { backgroundColor: colors.surface, borderColor: colors.border }, inputText.trim() && styles.pillWrapActive]}>
          <TextInput
            style={[styles.pillInput, { color: colors.textPrimary }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={apiKeyMissing ? 'Add your API key in Settings first' : 'Ask Aria anything…'}
            placeholderTextColor="#C7C7CC"
            multiline
            maxLength={500}
            editable={!apiKeyMissing && !isInitializing}
            onSubmitEditing={() => sendMessage(inputText)}
            accessibilityLabel="Message input"
          />
        </View>

        {inputText.trim() ? (
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={() => sendMessage(inputText)}
            accessibilityLabel="Send message"
          >
            <MaterialCommunityIcons name="arrow-up" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.roundBtn}
            onPress={() => navigation.navigate('Voice')}
            accessibilityLabel="Voice"
          >
            <MaterialCommunityIcons name="headphones" size={20} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.disclaimer}>
        For informational purposes only — always consult a healthcare professional.
      </Text>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" />

      {/* Safe-area fill behind Dynamic Island */}
      <View style={[styles.navBarSafeArea, { height: insets.top, backgroundColor: colors.surface }]} />

      {/* Nav bar */}
      <View style={[styles.navBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={30} color={Colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navCenter} activeOpacity={0.7}>
          <Avatar size={36} isSpeaking={isSpeaking} isListening={false} isIdle={!isSpeaking} />
          <View style={styles.navMeta}>
            <Text style={[styles.navName, { color: colors.textPrimary }]}>Aria</Text>
            <Text style={[styles.navStatus, isSpeaking && { color: Colors.accent }]}>
              {isSpeaking ? 'Speaking…' : isTyping ? 'Thinking…' : isInitializing ? 'Loading…' : 'Online'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => navigation.navigate('Library')}
          accessibilityLabel="Knowledge library"
        >
          <MaterialCommunityIcons name="library-outline" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* API key missing banner */}
      {apiKeyMissing && (
        <TouchableOpacity
          style={styles.apiKeyBanner}
          onPress={() => navigation.navigate('Profile')}
          accessibilityLabel="Add API key in settings"
        >
          <MaterialCommunityIcons name="key-alert" size={16} color="#fff" />
          <Text style={styles.apiKeyBannerText}>
            Add your OpenAI API key in Settings to start chatting
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Messages + input bar, keyboard-aware */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 68}
      >
        <FlatList
          ref={messageListRef}
          data={internalMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          ListEmptyComponent={renderChatEmpty}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.messageListContent}
          onContentSizeChange={() => messageListRef.current?.scrollToEnd({ animated: true })}
        />

        {renderFooter()}

        {inputBar}
      </KeyboardAvoidingView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  flex: {
    flex: 1,
  },

  // Nav bar
  navBarSafeArea: {
    backgroundColor: '#F9F9F9',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 68,
    paddingHorizontal: 8,
    backgroundColor: '#F9F9F9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  navBtn: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  navMeta: {
    alignItems: 'flex-start',
    gap: 1,
  },
  navName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    letterSpacing: -0.3,
  },
  navStatus: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: '500',
  },

  // API key banner
  apiKeyBanner: {
    backgroundColor: Colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  apiKeyBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },

  // Typing indicator
  typingRow: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0F0F5',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    alignSelf: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8E8E93',
  },

  // Message text
  messageListContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  messageRow: {
    marginBottom: 10,
  },
  messageRowAria: {
    alignItems: 'flex-start',
  },
  messageRowUser: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageBubbleAria: {
    backgroundColor: '#F0F0F5',
    borderBottomLeftRadius: 4,
  },
  messageBubbleUser: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  messageTextUser: {
    color: '#fff',
  },
  messageTextAria: {
    color: '#1A1A1A',
  },

  // Sources below AI bubbles
  sourcesContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginLeft: 4,
    marginTop: 4,
    marginBottom: 6,
    gap: 5,
    maxWidth: '80%',
  },
  sourcesList: {
    flex: 1,
    gap: 1,
  },
  sourceText: {
    fontSize: 11,
    color: Colors.primary,
    lineHeight: 15,
    fontStyle: 'italic',
  },
  sourceLink: {
    textDecorationLine: 'underline',
  },

  // Input area
  inputArea: {
    backgroundColor: '#F9F9F9',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
    paddingTop: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  initRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  initText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  chips: {
    gap: 7,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  chip: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  chipText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.error}12`,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    borderWidth: 1,
    borderColor: `${Colors.error}25`,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: Colors.error,
    lineHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E9E9EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  pillWrap: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6C8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    maxHeight: 120,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  pillWrapActive: {
    borderColor: Colors.primary,
    shadowOpacity: 0.1,
  },
  pillInput: {
    fontSize: 16,
    color: '#000',
    padding: 0,
    lineHeight: 20,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  disclaimer: {
    fontSize: 10,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 14,
    paddingBottom: 2,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // Crisis card
  crisisCard: {
    marginBottom: 10,
    marginHorizontal: 10,
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
    padding: 14,
  },
  crisisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  crisisTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D4375D',
  },
  crisisBody: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 12,
  },
  crisisContacts: {
    gap: 8,
  },
  crisisContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  crisisContactText: {
    flex: 1,
    gap: 1,
  },
  crisisContactLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  crisisContactSub: {
    fontSize: 11,
    color: '#8E8E93',
  },
  crisisContactNumber: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Feedback buttons
  feedbackRow: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 4,
    marginTop: 4,
  },
  feedbackBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0F0F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBtnActive: {
    backgroundColor: '#E8F4FF',
  },
});
