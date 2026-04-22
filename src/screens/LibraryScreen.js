import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  FlatList,
  Animated,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CategoryCard } from '../components/CategoryCard';
import { Colors } from '../constants/colors';
import { Typography, FontSize } from '../constants/typography';
import { KNOWLEDGE_CATEGORIES, FEATURED_RESOURCES } from '../constants/data';

const ResourceItem = ({ resource, onPress }) => (
  <TouchableOpacity
    style={styles.resourceCard}
    onPress={() => onPress?.(resource)}
    activeOpacity={0.75}
    accessibilityLabel={`${resource.title}, ${resource.readTime}`}
    accessibilityRole="button"
  >
    <View style={styles.resourceType}>
      <MaterialCommunityIcons
        name={resource.type === 'guide' ? 'book-open-page-variant' : 'file-document-outline'}
        size={14}
        color={Colors.primary}
      />
      <Text style={styles.resourceTypeText}>{resource.type === 'guide' ? 'Guide' : 'Article'}</Text>
    </View>
    <Text style={styles.resourceTitle} numberOfLines={2}>{resource.title}</Text>
    <View style={styles.resourceMeta}>
      <Text style={styles.resourceCategory}>{resource.category}</Text>
      <View style={styles.dot} />
      <Text style={styles.resourceReadTime}>{resource.readTime}</Text>
    </View>
    <View style={styles.resourceTags}>
      {resource.tags.slice(0, 3).map(tag => (
        <View key={tag} style={styles.tag}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      ))}
    </View>
    <MaterialCommunityIcons
      name="arrow-right"
      size={18}
      color={Colors.textTertiary}
      style={styles.resourceArrow}
    />
  </TouchableOpacity>
);

export const LibraryScreen = ({ navigation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const searchScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    Animated.spring(searchScaleAnim, {
      toValue: isSearchFocused ? 1.01 : 1,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
  }, [isSearchFocused]);

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'article', label: 'Articles' },
    { id: 'guide', label: 'Guides' },
    { id: 'saved', label: 'Saved' },
  ];

  const filteredResources = FEATURED_RESOURCES.filter(r => {
    const matchesSearch =
      !searchQuery ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = activeFilter === 'all' || r.type === activeFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Knowledge Library</Text>
              <Text style={styles.headerSub}>Evidence-based dementia care resources</Text>
            </View>
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() => navigation.navigate('Chat')}
              accessibilityLabel="Ask Aria a question"
            >
              <MaterialCommunityIcons name="chat-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Stats banner */}
          <LinearGradient
            colors={[Colors.primaryMuted, Colors.secondaryMuted]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.statsBanner}
          >
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>228</Text>
              <Text style={styles.statLabel}>Resources</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>6</Text>
              <Text style={styles.statLabel}>Categories</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>2024</Text>
              <Text style={styles.statLabel}>Updated</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Search */}
        <Animated.View
          style={[styles.searchSection, { opacity: fadeAnim, transform: [{ scale: searchScaleAnim }] }]}
        >
          <View style={[styles.searchBar, isSearchFocused && styles.searchBarFocused]}>
            <MaterialCommunityIcons name="magnify" size={20} color={isSearchFocused ? Colors.primary : Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search resources, topics, keywords..."
              placeholderTextColor={Colors.textTertiary}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              accessibilityLabel="Search knowledge library"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Clear search">
                <MaterialCommunityIcons name="close-circle" size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterChip, activeFilter === f.id && styles.filterChipActive]}
                onPress={() => setActiveFilter(f.id)}
                accessibilityLabel={`Filter by ${f.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: activeFilter === f.id }}
              >
                <Text style={[styles.filterText, activeFilter === f.id && styles.filterTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Categories */}
        {!searchQuery && (
          <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Categories</Text>
              <TouchableOpacity accessibilityLabel="See all categories">
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {KNOWLEDGE_CATEGORIES.map(cat => (
              <CategoryCard
                key={cat.id}
                category={cat}
                onPress={() => navigation.navigate('Chat', { initialMessage: `Tell me about ${cat.title}` })}
              />
            ))}
          </Animated.View>
        )}

        {/* Resources */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {searchQuery ? `Results (${filteredResources.length})` : 'Featured Resources'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity accessibilityLabel="See all resources">
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            )}
          </View>

          {filteredResources.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="file-search-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyTitle}>No results found</Text>
              <Text style={styles.emptyBody}>Try different search terms or browse a category</Text>
              <TouchableOpacity
                style={styles.askAriaButton}
                onPress={() => navigation.navigate('Chat', { initialMessage: searchQuery })}
              >
                <MaterialCommunityIcons name="robot-excited" size={18} color={Colors.textInverse} />
                <Text style={styles.askAriaText}>Ask Aria instead</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredResources.map(r => (
              <ResourceItem
                key={r.id}
                resource={r}
                onPress={() => navigation.navigate('Chat', { initialMessage: `Tell me more about: ${r.title}` })}
              />
            ))
          )}
        </Animated.View>

        {/* Ask Aria CTA */}
        {!searchQuery && (
          <Animated.View style={[styles.ctaSection, { opacity: fadeAnim }]}>
            <TouchableOpacity
              style={styles.ctaCard}
              onPress={() => navigation.navigate('Chat')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.primaryLight, Colors.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaGradient}
              >
                <MaterialCommunityIcons name="robot-excited-outline" size={32} color={Colors.textInverse} />
                <View style={styles.ctaText}>
                  <Text style={styles.ctaTitle}>Can't find what you need?</Text>
                  <Text style={styles.ctaSub}>Ask Aria — your AI guide is ready to help</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.8)" />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitle: {
    ...Typography.headlineLarge,
    color: Colors.textPrimary,
  },
  headerSub: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    marginTop: 3,
  },
  chatButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBanner: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    ...Typography.headlineMedium,
    color: Colors.primary,
  },
  statLabel: {
    ...Typography.labelSmall,
    color: Colors.textSecondary,
    textTransform: 'none',
    letterSpacing: 0,
    marginTop: 2,
    fontSize: 11,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  searchSection: {
    paddingHorizontal: 20,
    marginTop: 8,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  searchBarFocused: {
    borderColor: Colors.primary,
    shadowOpacity: 0.1,
  },
  searchInput: {
    flex: 1,
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  filterRow: {
    gap: 8,
    paddingRight: 4,
  },
  filterChip: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    ...Typography.labelMedium,
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: Colors.textInverse,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    ...Typography.titleLarge,
    color: Colors.textPrimary,
  },
  seeAll: {
    ...Typography.labelMedium,
    color: Colors.primary,
  },
  resourceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  resourceType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  resourceTypeText: {
    ...Typography.labelSmall,
    color: Colors.primary,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '600',
    fontSize: 11,
  },
  resourceTitle: {
    ...Typography.titleMedium,
    color: Colors.textPrimary,
    marginBottom: 8,
    lineHeight: 22,
  },
  resourceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  resourceCategory: {
    ...Typography.labelSmall,
    color: Colors.textSecondary,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '500',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
  },
  resourceReadTime: {
    ...Typography.labelSmall,
    color: Colors.textTertiary,
    textTransform: 'none',
    letterSpacing: 0,
  },
  resourceTags: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    ...Typography.labelSmall,
    color: Colors.primaryDark,
    textTransform: 'none',
    letterSpacing: 0,
    fontSize: 11,
  },
  resourceArrow: {
    position: 'absolute',
    right: 16,
    top: '50%',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyTitle: {
    ...Typography.titleMedium,
    color: Colors.textSecondary,
  },
  emptyBody: {
    ...Typography.bodySmall,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  askAriaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
  },
  askAriaText: {
    ...Typography.labelLarge,
    color: Colors.textInverse,
  },
  ctaSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  ctaCard: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
  },
  ctaText: {
    flex: 1,
    gap: 3,
  },
  ctaTitle: {
    ...Typography.titleMedium,
    color: Colors.textInverse,
  },
  ctaSub: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.82)',
  },
});
