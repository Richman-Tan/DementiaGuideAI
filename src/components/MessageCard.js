import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/colors';
import { Typography, FontSize } from '../constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const MessageCard = ({ message, onPlayAudio, settings }) => {
  const isAssistant = message.role === 'assistant';
  const textScale = settings?.textSize === 'large' ? 1.15 : settings?.textSize === 'small' ? 0.9 : 1;

  return (
    <View style={[styles.wrapper, isAssistant ? styles.assistantWrapper : styles.userWrapper]}>
      {isAssistant && (
        <View style={styles.avatarBadge}>
          <MaterialCommunityIcons name="robot-excited" size={16} color={Colors.textInverse} />
        </View>
      )}

      <View
        style={[
          styles.bubble,
          isAssistant ? styles.assistantBubble : styles.userBubble,
        ]}
      >
        <Text
          style={[
            styles.messageText,
            isAssistant ? styles.assistantText : styles.userText,
            { fontSize: FontSize.base * textScale, lineHeight: FontSize.base * textScale * 1.6 },
          ]}
        >
          {message.text}
        </Text>

        {isAssistant && message.sources && message.sources.length > 0 && (
          <View style={styles.sourcesContainer}>
            <Text style={styles.sourcesLabel}>Sources</Text>
            {message.sources.map((source, index) => (
              <Text key={index} style={styles.sourceItem}>
                · {source}
              </Text>
            ))}
          </View>
        )}

        {isAssistant && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onPlayAudio?.(message)}
              accessibilityLabel="Play audio response"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="volume-high" size={16} color={Colors.primary} />
              <Text style={styles.actionText}>Listen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              accessibilityLabel="Copy response"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="content-copy" size={16} color={Colors.textTertiary} />
              <Text style={[styles.actionText, { color: Colors.textTertiary }]}>Copy</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {!isAssistant && (
        <View style={styles.userIndicator}>
          <MaterialCommunityIcons name="account-circle" size={28} color={Colors.textSecondary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
  assistantWrapper: {
    justifyContent: 'flex-start',
  },
  userWrapper: {
    justifyContent: 'flex-end',
  },
  avatarBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 4,
    flexShrink: 0,
  },
  userIndicator: {
    marginLeft: 8,
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 20,
    padding: 16,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  assistantBubble: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 6,
  },
  messageText: {
    ...Typography.bodyMedium,
  },
  assistantText: {
    color: Colors.textPrimary,
  },
  userText: {
    color: Colors.textInverse,
  },
  sourcesContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sourcesLabel: {
    ...Typography.labelSmall,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  sourceItem: {
    ...Typography.bodySmall,
    color: Colors.primary,
    marginBottom: 2,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    ...Typography.labelMedium,
    color: Colors.primary,
    fontWeight: '500',
  },
});
