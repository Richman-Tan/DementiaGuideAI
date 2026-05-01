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
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GiftedChat, Bubble } from 'react-native-gifted-chat';
import { Avatar } from '../components/Avatar';
import { Colors } from '../constants/colors';
import { QUICK_QUESTIONS, SAMPLE_MESSAGES } from '../constants/data';
import { openaiService, OpenAIAuthError, OpenAIRateLimitError } from '../services/openaiService';

const MESSAGES_KEY = 'chat_messages_v1';
const MAX_PERSISTED = 100;
const ARIA_USER = { _id: 'aria', name: 'Aria' };
const ME_USER = { _id: 'user', name: 'You' };

const ERROR_MESSAGES = {
  auth: 'Invalid API key — update it in Settings',
  ratelimit: 'Rate limit reached — wait a moment and try again',
  network: 'Connection error — check your internet connection',
};

// ─── Typing indicator ─────────────────────────────────────────────────────────
const TypingIndicator = ({ anim }) => (
  <View style={styles.typingRow}>
    <View style={styles.typingBubble}>
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

// ─── Helpers: convert between internal and GiftedChat formats ─────────────────
const toGifted = (msg) => ({
  _id: msg.id,
  text: msg.text,
  createdAt: new Date(msg.timestamp),
  user: msg.role === 'user' ? ME_USER : ARIA_USER,
  sources: msg.sources ?? [],
  pending: false,
});

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
  // Internal message list (newest last) — GiftedChat uses newest-first internally
  const [internalMessages, setInternalMessages] = useState(SAMPLE_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState(null); // null | 'auth' | 'ratelimit' | 'network'
  const initialMessageSent = useRef(false);
  const typingAnim = useRef(new Animated.Value(0)).current;

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

  // Re-check API key when screen comes back into focus (e.g. after saving in Profile)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
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

    // Build history for the RAG context window (last 6 messages)
    const history = internalMessages.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    try {
      const response = await openaiService.chat(trimmed, history);
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

      setTimeout(() => setIsSpeaking(false), 3000);
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
  }, [internalMessages, apiKeyMissing, isInitializing]);

  // GiftedChat onSend handler
  const onGiftedSend = useCallback((messages = []) => {
    if (messages[0]?.text) sendMessage(messages[0].text);
  }, [sendMessage]);

  // Convert internal messages to GiftedChat format (newest first)
  const giftedMessages = [...internalMessages].reverse().map(toGifted);

  // ── Custom renderers ──────────────────────────────────────────────────────────

  const renderMessageText = (props) => {
    const isUser = props.currentMessage.user._id === 'user';
    return (
      <Text style={[
        styles.messageText,
        isUser ? styles.messageTextUser : styles.messageTextAria,
      ]}>
        {props.currentMessage.text}
      </Text>
    );
  };

  const renderBubble = (props) => {
    const isUser = props.currentMessage.user._id === 'user';
    const sources = props.currentMessage.sources ?? [];
    return (
      <View>
        <Bubble
          {...props}
          wrapperStyle={{
            right: {
              backgroundColor: Colors.primary,
              borderRadius: 18,
              borderBottomRightRadius: 4,
              marginRight: 0,
              paddingHorizontal: 2,
              shadowColor: Colors.primary,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 4,
              elevation: 3,
            },
            left: {
              backgroundColor: '#F0F0F5',
              borderRadius: 18,
              borderBottomLeftRadius: 4,
              marginLeft: 0,
              paddingHorizontal: 2,
            },
          }}
          textStyle={{
            right: {
              color: '#fff',
              fontSize: 16,
              lineHeight: 22,
              letterSpacing: -0.2,
            },
            left: {
              color: '#1A1A1A',
              fontSize: 16,
              lineHeight: 22,
              letterSpacing: -0.2,
            },
          }}
          timeTextStyle={{
            right: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
            left: { color: Colors.textTertiary, fontSize: 11 },
          }}
          renderMessageText={renderMessageText}
        />
        {!isUser && sources.length > 0 && (
          <View style={styles.sourcesContainer}>
            <MaterialCommunityIcons name="book-open-outline" size={12} color={Colors.primary} />
            <View style={styles.sourcesList}>
              {sources.map((s, i) => (
                <Text key={i} style={styles.sourceText}>· {s}</Text>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderChatEmpty = () => (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons name="chat-outline" size={48} color={Colors.border} />
      <Text style={styles.emptyText}>Ask Aria anything about dementia care</Text>
    </View>
  );

  const renderFooter = () => {
    if (!isTyping) return null;
    return <TypingIndicator anim={typingAnim} />;
  };

  // ── Input bar (rendered outside GiftedChat so layout is never clipped) ────────
  const inputBar = (
    <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
          {QUICK_QUESTIONS.slice(0, 5).map((chip, i) => (
            <TouchableOpacity
              key={i}
              style={styles.chip}
              onPress={() => sendMessage(chip)}
              accessibilityLabel={chip}
            >
              <Text style={styles.chipText}>{chip}</Text>
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

        <View style={[styles.pillWrap, inputText.trim() && styles.pillWrapActive]}>
          <TextInput
            style={styles.pillInput}
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
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* Safe-area fill behind Dynamic Island */}
      <View style={[styles.navBarSafeArea, { height: insets.top }]} />

      {/* Nav bar */}
      <View style={styles.navBar}>
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
            <Text style={styles.navName}>Aria</Text>
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
        <GiftedChat
          messages={giftedMessages}
          onSend={onGiftedSend}
          user={ME_USER}
          renderBubble={renderBubble}
          renderInputToolbar={() => null}
          renderFooter={renderFooter}
          renderChatEmpty={renderChatEmpty}
          renderAvatar={null}
          renderAvatarOnTop={false}
          showUserAvatar={false}
          showAvatarForEveryMessage={false}
          renderUsernameOnMessage={false}
          isTyping={false}
          alwaysShowSend={false}
          isKeyboardInternallyHandled={false}
          keyboardShouldPersistTaps="handled"
          listViewProps={{
            showsVerticalScrollIndicator: false,
            contentContainerStyle: { paddingTop: 8 },
          }}
          minInputToolbarHeight={0}
        />

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
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
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
    transform: [{ scaleY: -1 }],
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
