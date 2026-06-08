import { supabase } from './supabaseService';
import { openaiService } from './openaiService';

class KnowledgeService {
  async getAllResources() {
    const { data, error } = await supabase
      .from('knowledge_chunks')
      .select('id, category, title, content, tags, source_url, source_org')
      .order('id', { ascending: true });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  // Semantic search via RAG pipeline → Supabase pgvector.
  // Falls back to Supabase full-text keyword search if OpenAI is unavailable.
  async searchResources(query) {
    try {
      return await openaiService.search(query);
    } catch {
      // Fallback: keyword match via Supabase
      const { data } = await supabase
        .from('knowledge_chunks')
        .select('id, category, title, content, tags, source_url, source_org')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .limit(5);
      return data ?? [];
    }
  }

  async getCategories() {
    // Return distinct categories with live counts from Supabase
    const { data } = await supabase
      .from('knowledge_chunks')
      .select('category');
    if (!data) return {};
    return data.reduce((acc, row) => {
      acc[row.category] = (acc[row.category] ?? 0) + 1;
      return acc;
    }, {});
  }

  // Return all articles belonging to a given category ID
  async getCategoryResources(categoryId) {
    const { data } = await supabase
      .from('knowledge_chunks')
      .select('id, category, title, content, tags, source_url, source_org')
      .eq('category', categoryId);
    return data ?? [];
  }

  // Return a small, curated selection for the home screen "Featured" list
  async getFeaturedResources() {
    const featured = [
      'prevention_002',    // Warning Signs of Dementia
      'clinical_001',      // Stages of Dementia
      'caregiving_007',    // Establishing Daily Routine
      'communication_001', // Effective Verbal Communication
      'bestpractices_007', // Caregiver Burnout
      'homesafety_002',    // Bathroom Fall Prevention
      'prevention_001',    // 14 Modifiable Risk Factors
    ];
    const { data } = await supabase
      .from('knowledge_chunks')
      .select('id, category, title, content, tags, source_url, source_org')
      .in('id', featured);
    // Preserve original curation order
    return featured
      .map(id => data?.find(c => c.id === id))
      .filter(Boolean);
  }
}

export const knowledgeService = new KnowledgeService();

