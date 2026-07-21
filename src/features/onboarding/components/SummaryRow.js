import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/theme/colors';

export function SummaryRow({ label, value, onEdit }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      <TouchableOpacity
        onPress={onEdit}
        style={styles.changeBtn}
        accessibilityLabel={`Change ${label}`}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.changeText}>Change</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  label: {
    flex: 1,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  value: {
    flex: 1.5,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  changeBtn: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  changeText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
});
