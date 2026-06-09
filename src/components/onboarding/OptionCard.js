import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

export function OptionCard({ label, description, icon, selected, onPress, style }) {
  return (
    <TouchableOpacity
      style={[
        styles.card,
        selected ? styles.cardSelected : styles.cardDefault,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
    >
      {icon && (
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: selected ? `${Colors.primary}20` : `${Colors.textTertiary}12` },
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={22}
            color={selected ? Colors.primary : Colors.textTertiary}
          />
        </View>
      )}

      <View style={styles.textBlock}>
        <Text
          style={[
            styles.label,
            { color: Colors.textPrimary },
          ]}
        >
          {label}
        </Text>
        {!!description && (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>

      {selected ? (
        <View style={styles.checkFilled}>
          <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
        </View>
      ) : (
        <View style={styles.checkHollow} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 72,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  cardDefault: {
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  checkFilled: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkHollow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    flexShrink: 0,
  },
});
