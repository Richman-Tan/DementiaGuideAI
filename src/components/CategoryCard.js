import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';

export const CategoryCard = ({ category, onPress, compact = false }) => {
  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.cardCompact, { borderColor: `${category.color}30` }]}
      onPress={() => onPress?.(category)}
      activeOpacity={0.75}
      accessibilityLabel={`${category.title} — ${category.description}`}
      accessibilityRole="button"
    >
      <View style={[styles.iconContainer, { backgroundColor: category.colorMuted }]}>
        <MaterialCommunityIcons name={category.icon} size={compact ? 20 : 24} color={category.color} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>
          {category.title}
        </Text>
        {!compact && (
          <Text style={styles.description} numberOfLines={2}>
            {category.description}
          </Text>
        )}
        <View style={styles.countRow}>
          <Text style={[styles.count, { color: category.color }]}>{category.count} resources</Text>
        </View>
      </View>

      <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textTertiary} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  cardCompact: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    ...Typography.titleMedium,
    color: Colors.textPrimary,
  },
  titleCompact: {
    fontSize: 15,
  },
  description: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  count: {
    ...Typography.labelSmall,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
