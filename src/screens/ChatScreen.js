import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar } from '../components/Avatar';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { SAMPLE_MESSAGES } from '../constants/data';
import { aceService } from '../services/aceService';

// ─── iMessage-style bubble ───────────────────────────────────────────────────
const Bubble = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAria]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAria]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAria]}>
          {message.text}
        </Text>
        {!isUser && message.sources?.length > 0 && (
          <View style={styles.sources}>
            {message.sources.map((s, i) => (
              <Text key={i} style={styles.sourceText}>· {s}</Text>
            ))}
          </View>
        )}
      </View>
      {/* Bubble tail */}
      {isUser
        ? <View style={styles.tailRight} />
        : <View style={styles.tailLeft} />
      }
    </View>
  );
};

// ─── Typing indicator ─────────────────────────────────────────────────────────
const TypingBubble = ({ anim }) => (
  <View style={[styles.bubbleRow, styles.bubbleRowAria]}>
    <View style={[styles.bubble, styles.bubbleAria, styles.typingBubble]}>
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
    <View style={styles.tailLeft} />
  </View>
);

// ─── Main screen ──────────────────────────────────────────────────────────────
export const ChatScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState(SAMPLE_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const typingAnim = useRef(new Animated.Value(0)).current;
  const initialMessageSent = useRef(false);

  useEffect(() => {
    if (route.params?.initialMessage && !initialMessageSent.current) {
      initialMessageSent.current = true;
      sendMessage(route.params.initialMessage);
    }
  }, []);

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

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const sendMessage = useCallback(async (text) => {
    if (!text?.trim()) return;
    const trimmed = text.trim();
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
    }]);
    setInputText('');
    setIsTyping(true);
    scrollToEnd();

    try {
      const response = await aceService.sendText(trimmed);
      setIsTyping(false);
      setIsSpeaking(true);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: response.text,
        sources: response.sources,
        timestamp: new Date().toISOString(),
      }]);
      scrollToEnd();
      setTimeout(() => setIsSpeaking(false), 3000);
    } catch {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: "I'm sorry, I had trouble retrieving that. Please try again.",
        sources: [],
        timestamp: new Date().toISOString(),
      }]);
    }
  }, [scrollToEnd]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* ── iMessage-style nav bar ── */}
      {/* Safe-area fill so gradient/colour reaches the island */}
      <View style={[styles.navBarSafeArea, { height: insets.top }]} />
      <View style={styles.navBar}>
        {/* Back */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={30} color={Colors.primary} />
        </TouchableOpacity>

        {/* Center — avatar + name + status */}
        <TouchableOpacity style={styles.navCenter} activeOpacity={0.7}>
          <Avatar
            size={36}
            isSpeaking={isSpeaking}
            isListening={false}
            isIdle={!isSpeaking}
          />
          <View style={styles.navMeta}>
            <Text style={styles.navName}>Aria</Text>
            <Text style={[styles.navStatus, isSpeaking && { color: Colors.accent }]}>
              {isSpeaking ? 'Speaking…' : isTyping ? 'Typing…' : 'Online'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Library shortcut */}
        <TouchableOpacity
          style={styles.navRight}
          onPress={() => navigation.navigate('Library')}
          accessibilityLabel="Knowledge library"
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="library-outline" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 68}
      >
        {/* ── Messages ── */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
          renderItem={({ item }) => <Bubble message={item} />}
          ListFooterComponent={isTyping ? <TypingBubble anim={typingAnim} /> : null}
        />

        {/* ── Input area ── */}
        <View style={styles.inputArea}>
          {/* Suggestion chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {['Side effects?', 'Daily routine tips', 'Local services', 'Managing behaviour'].map((chip, i) => (
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

          {/* iMessage-style input row */}
          <View style={styles.inputRow}>
            {/* Mic — shown when no text */}
            {!inputText.trim() && (
              <TouchableOpacity
                style={styles.micBtn}
                onPress={() => navigation.navigate('Voice')}
                accessibilityLabel="Voice input"
              >
                <MaterialCommunityIcons name="microphone" size={20} color={Colors.primary} />
              </TouchableOpacity>
            )}

            {/* Pill text field */}
            <View style={[styles.pillWrap, inputText.trim() && styles.pillWrapExpanded]}>
              <TextInput
                ref={inputRef}
                style={styles.pillInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="iMessage"
                placeholderTextColor="#C7C7CC"
                multiline
                maxLength={500}
                accessibilityLabel="Message input"
              />
            </View>

            {/* Send — shown when has text */}
            {inputText.trim() ? (
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={() => sendMessage(inputText)}
                accessibilityLabel="Send"
              >
                <MaterialCommunityIcons name="arrow-up" size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.micBtn}
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
      </KeyboardAvoidingView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const BUBBLE_RADIUS = 18;
const USER_COLOR = Colors.primary;
const ARIA_COLOR = '#E9E9EB';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: { flex: 1 },

  // ── Nav bar (iMessage style) ──
  // Safe-area strip: fills the space behind the Dynamic Island
  navBarSafeArea: {
    backgroundColor: '#F9F9F9',
  },
  // Content row: fixed height, items vertically centered
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 68,
    paddingHorizontal: 8,
    backgroundColor: '#F9F9F9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  backBtn: {
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
  navRight: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Message list ──
  list: {
    paddingTop: 24,
    paddingBottom: 4,
    paddingHorizontal: 8,
    gap: 2,
  },

  // ── Bubbles ──
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 2,
    alignItems: 'flex-end',
    paddingHorizontal: 6,
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAria: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BUBBLE_RADIUS,
  },
  bubbleUser: {
    backgroundColor: USER_COLOR,
    borderBottomRightRadius: 4,
    marginRight: -2,
  },
  bubbleAria: {
    backgroundColor: ARIA_COLOR,
    borderBottomLeftRadius: 4,
    marginLeft: -2,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  bubbleTextAria: {
    color: '#000',
  },
  sources: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.12)',
    gap: 2,
  },
  sourceText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },

  // Bubble tails (CSS triangle trick)
  tailRight: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderLeftColor: USER_COLOR,
    borderBottomWidth: 8,
    borderBottomColor: 'transparent',
    marginBottom: 0,
  },
  tailLeft: {
    width: 0,
    height: 0,
    borderRightWidth: 8,
    borderRightColor: ARIA_COLOR,
    borderBottomWidth: 8,
    borderBottomColor: 'transparent',
    marginBottom: 0,
  },

  // ── Typing indicator ──
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8E8E93',
  },

  // ── Input area ──
  inputArea: {
    backgroundColor: '#F9F9F9',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
    gap: 8,
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
  },
  chipText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  micBtn: {
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
  },
  pillWrapExpanded: {
    borderColor: Colors.primary,
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
  },
  disclaimer: {
    fontSize: 10,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 14,
    paddingBottom: 2,
  },
});
