import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Colors } from '../constants/colors';

const BAR_COUNT = 9;

export const VoiceWaveform = ({
  isActive = false,
  color = Colors.primary,
  barWidth = 4,
  maxHeight = 40,
  gap = 5,
  style,
}) => {
  const anims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15))
  ).current;
  const loopsRef = useRef([]);

  useEffect(() => {
    loopsRef.current.forEach(l => l?.stop?.());
    loopsRef.current = [];

    if (isActive) {
      anims.forEach((anim, i) => {
        const delay = (i * 80) % 400;
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, {
              toValue: 0.2 + Math.random() * 0.8,
              duration: 250 + Math.random() * 350,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 0.15 + Math.random() * 0.3,
              duration: 250 + Math.random() * 350,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
          ])
        );
        loop.start();
        loopsRef.current.push(loop);
      });
    } else {
      anims.forEach(anim => {
        Animated.spring(anim, {
          toValue: 0.15,
          useNativeDriver: false,
          tension: 60,
          friction: 8,
        }).start();
      });
    }

    return () => {
      loopsRef.current.forEach(l => l?.stop?.());
    };
  }, [isActive]);

  return (
    <View style={[styles.container, style]}>
      {anims.map((anim, i) => {
        const height = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [4, maxHeight],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.bar,
              {
                width: barWidth,
                height,
                backgroundColor: color,
                opacity: isActive ? 1 : 0.35,
                marginHorizontal: gap / 2,
                borderRadius: barWidth / 2,
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {},
});
