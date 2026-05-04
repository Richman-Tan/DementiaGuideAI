import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Share,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { KNOWLEDGE_CATEGORIES } from '../constants/data';
import { KNOWLEDGE_BASE } from '../data/knowledgeBase';

const wordCount = content => content.split(/\s+/).length;
const readTime = content => `${Math.ceil(wordCount(content) / 200)} min read`;

// Split content into numbered list items or plain paragraphs
const parseContent = (content) => {
  // Detect (1), (2) ... numbered list pattern
  if (/\(1\)/.test(content)) {
    const parts = content.split(/(?=\(\d+\)\s)/);
    return parts.map((part, i) => {
      const match = part.match(/^\((\d+)\)\s([\s\S]+)/);
      if (match) {
        return { type: 'numbered', num: match[1], text: match[2].trim(), key: i };
      }
      return part.trim() ? { type: 'paragraph', text: part.trim(), key: i } : null;
    }).filter(Boolean);
  }
  return [{ type: 'paragraph', text: content, key: 0 }];
};

export const ArticleDetailScreen = ({ navigation, route }) => {
  const { article } = route.params;
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  const category = KNOWLEDGE_CATEGORIES.find(c => c.id === article.category);
  const contentParts = parseContent(article.content);

  const relatedArticles = KNOWLEDGE_BASE
    .filter(a => a.category === article.category && a.id !== article.id)
    .slice(0, 3);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        title: article.title,
        message: `${article.title}\n\n${article.content.slice(0, 300)}…\n\nShared from DementiaGuide AI`,
      });
    } catch { /* ignore */ }
  }, [article]);

  const handleAskAria = useCallback(() => {
    navigation.navigate('Main', {
      screen: 'Chat',
      params: {
        initialMessage: `I just read the article "${article.title}". Can you help me understand this better and how to apply it to my specific situation?`,
      },
    });
  }, [navigation, article]);

  const handleRelatedArticle = useCallback((related) => {
    navigation.push('ArticleDetail', { article: related });
  }, [navigation]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Coloured header band */}
      <LinearGradient
        colors={[category?.color ?? Colors.primary, category?.color ? `${category.color}CC` : Colors.primaryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerBand, { paddingTop: insets.top }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back to Library"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
            <Text style={styles.backText}>Library</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleShare}
            accessibilityLabel="Share article"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialCommunityIcons name="share-variant-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Category badge */}
        <Animated.View style={[styles.categoryBadge, { opacity: fadeAnim }]}>
          <MaterialCommunityIcons
            name={category?.icon ?? 'file-document-outline'}
            size={13}
            color="rgba(255,255,255,0.9)"
          />
          <Text style={styles.categoryBadgeText}>
            {category?.title ?? article.category}
          </Text>
        </Animated.View>

        {/* Title */}
        <Animated.Text
          style={[styles.headerTitle, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          {article.title}
        </Animated.Text>

        {/* Meta row */}
        <Animated.View style={[styles.metaRow, { opacity: fadeAnim }]}>
          <MaterialCommunityIcons name="clock-outline" size={13} color="rgba(255,255,255,0.75)" />
          <Text style={styles.metaText}>{readTime(article.content)}</Text>
          <View style={styles.metaDot} />
          <MaterialCommunityIcons name="text" size={13} color="rgba(255,255,255,0.75)" />
          <Text style={styles.metaText}>{wordCount(article.content).toLocaleString()} words</Text>
        </Animated.View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Article body */}
          <View style={styles.bodySection}>
            {contentParts.map((part) =>
              part.type === 'numbered' ? (
                <View key={part.key} style={styles.numberedItem}>
                  <View style={[styles.numBadge, { backgroundColor: category?.colorMuted ?? Colors.primaryMuted }]}>
                    <Text style={[styles.numBadgeText, { color: category?.color ?? Colors.primary }]}>
                      {part.num}
                    </Text>
                  </View>
                  <Text style={styles.numberedText}>{part.text}</Text>
                </View>
              ) : (
                <Text key={part.key} style={styles.bodyText}>{part.text}</Text>
              )
            )}
          </View>

          {/* Tags */}
          <View style={styles.tagsSection}>
            <Text style={styles.tagsSectionLabel}>Topics covered</Text>
            <View style={styles.tagsRow}>
              {article.tags.map(tag => (
                <View
                  key={tag}
                  style={[styles.tag, { backgroundColor: category?.colorMuted ?? Colors.primaryMuted }]}
                >
                  <Text style={[styles.tagText, { color: category?.color ?? Colors.primary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Ask Aria CTA */}
          <TouchableOpacity
            style={styles.ariaCta}
            onPress={handleAskAria}
            activeOpacity={0.85}
            accessibilityLabel="Ask Aria about this article"
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryLight, Colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ariaCtaGradient}
            >
              <MaterialCommunityIcons name="robot-excited-outline" size={26} color="#fff" />
              <View style={styles.ariaCtaText}>
                <Text style={styles.ariaCtaTitle}>Ask Aria about this</Text>
                <Text style={styles.ariaCtaSub}>Get personalised guidance from your AI guide</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.75)" />
            </LinearGradient>
          </TouchableOpacity>

          {/* Related articles */}
          {relatedArticles.length > 0 && (
            <View style={styles.relatedSection}>
              <Text style={styles.relatedTitle}>More in {category?.title}</Text>
              {relatedArticles.map(related => (
                <TouchableOpacity
                  key={related.id}
                  style={styles.relatedCard}
                  onPress={() => handleRelatedArticle(related)}
                  activeOpacity={0.75}
                  accessibilityLabel={related.title}
                >
                  <View style={[styles.relatedIcon, { backgroundColor: category?.colorMuted ?? Colors.primaryMuted }]}>
                    <MaterialCommunityIcons
                      name={category?.icon ?? 'file-document-outline'}
                      size={16}
                      color={category?.color ?? Colors.primary}
                    />
                  </View>
                  <View style={styles.relatedMeta}>
                    <Text style={styles.relatedCardTitle} numberOfLines={2}>{related.title}</Text>
                    <Text style={styles.relatedReadTime}>{readTime(related.content)}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header band
  headerBand: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backText: {
    fontSize: 17,
    color: '#fff',
    fontWeight: '500',
  },
  shareBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  categoryBadgeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 30,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginHorizontal: 2,
  },

  // Body
  scrollContent: {
    paddingTop: 4,
  },
  bodySection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 27,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
    marginBottom: 4,
  },

  // Numbered list items
  numberedItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  numBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  numBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  numberedText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 26,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },

  // Tags
  tagsSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 10,
  },
  tagsSectionLabel: {
    ...Typography.labelSmall,
    color: Colors.textTertiary,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  tag: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Ask Aria CTA
  ariaCta: {
    marginHorizontal: 20,
    marginBottom: 28,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  ariaCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
  },
  ariaCtaText: {
    flex: 1,
    gap: 3,
  },
  ariaCtaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  ariaCtaSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
  },

  // Related articles
  relatedSection: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 10,
  },
  relatedTitle: {
    ...Typography.labelSmall,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  relatedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  relatedIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  relatedMeta: {
    flex: 1,
    gap: 3,
  },
  relatedCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  relatedReadTime: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
});
