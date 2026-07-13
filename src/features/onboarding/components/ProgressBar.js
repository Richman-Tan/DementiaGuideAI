import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/theme/colors';

export function ProgressBar({ step, totalSteps }) {
  return (
    <View
      style={styles.container}
      accessibilityLabel={`Step ${step} of ${totalSteps}`}
    >
      <View style={styles.dotsRow}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const filled = i < step;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                filled ? styles.dotFilled : styles.dotHollow,
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.label}>
        Step {step} of {totalSteps}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotFilled: {
    backgroundColor: Colors.primary,
  },
  dotHollow: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  label: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
});
