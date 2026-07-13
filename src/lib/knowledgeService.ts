import { supabase } from './supabaseService';
import { openaiService } from './openaiService';
import type { KnowledgeChunk } from './types';

const CHUNK_COLUMNS = 'id, category, title, content, tags, source_url, source_org';

class KnowledgeService {
  // Semantic search via RAG pipeline → Supabase pgvector.
  // Falls back to Supabase full-text keyword search if OpenAI is unavailable.
  async searchResources(query: string): Promise<KnowledgeChunk[]> {
    try {
      return (await openaiService.search(query)) as KnowledgeChunk[];
    } catch {
      // Fallback: keyword match via Supabase
      const { data } = await supabase
        .from('knowledge_chunks')
        .select(CHUNK_COLUMNS)
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .limit(5);
      return (data ?? []) as KnowledgeChunk[];
    }
  }

  async getCategories(): Promise<Record<string, number>> {
    // Return distinct categories with live counts from Supabase
    const { data } = await supabase.from('knowledge_chunks').select('category');
    if (!data) return {};
    return (data as { category: string }[]).reduce<Record<string, number>>((acc, row) => {
      acc[row.category] = (acc[row.category] ?? 0) + 1;
      return acc;
    }, {});
  }

  // Return all articles belonging to a given category ID
  async getCategoryResources(categoryId: string): Promise<KnowledgeChunk[]> {
    const { data } = await supabase
      .from('knowledge_chunks')
      .select(CHUNK_COLUMNS)
      .eq('category', categoryId);
    return (data ?? []) as KnowledgeChunk[];
  }

  // Return a small, curated selection for the home screen "Featured" list
  async getFeaturedResources(): Promise<KnowledgeChunk[]> {
    const featured = [
      'prevention_002', // Warning Signs of Dementia
      'clinical_001', // Stages of Dementia
      'caregiving_007', // Establishing Daily Routine
      'communication_001', // Effective Verbal Communication
      'bestpractices_007', // Caregiver Burnout
      'homesafety_002', // Bathroom Fall Prevention
      'prevention_001', // 14 Modifiable Risk Factors
    ];
    const { data } = await supabase
      .from('knowledge_chunks')
      .select(CHUNK_COLUMNS)
      .in('id', featured);
    const rows = (data ?? []) as KnowledgeChunk[];
    // Preserve original curation order
    return featured
      .map((id) => rows.find((c) => c.id === id))
      .filter((c): c is KnowledgeChunk => Boolean(c));
  }
}

export const knowledgeService = new KnowledgeService();
