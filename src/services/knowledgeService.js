import { KNOWLEDGE_BASE } from '../data/knowledgeBase';
import { openaiService } from './openaiService';

class KnowledgeService {
  // Semantic search across the full knowledge base via the RAG pipeline.
  // Falls back to tag/title keyword matching if embeddings are not yet ready.
  async searchResources(query) {
    try {
      const chunks = await openaiService.search(query);
      return chunks;
    } catch {
      // Fallback: keyword match on title and tags
      const q = query.toLowerCase();
      return KNOWLEDGE_BASE.filter(
        r =>
          r.title.toLowerCase().includes(q) ||
          r.tags.some(t => t.toLowerCase().includes(q))
      ).slice(0, 5);
    }
  }

  async getCategories() {
    // Return distinct categories with live counts from the knowledge base
    const counts = KNOWLEDGE_BASE.reduce((acc, chunk) => {
      acc[chunk.category] = (acc[chunk.category] ?? 0) + 1;
      return acc;
    }, {});
    return counts;
  }

  // Return all articles belonging to a given category ID
  async getCategoryResources(categoryId) {
    return KNOWLEDGE_BASE.filter(chunk => chunk.category === categoryId);
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
    return KNOWLEDGE_BASE.filter(chunk => featured.includes(chunk.id));
  }
}

export const knowledgeService = new KnowledgeService();
