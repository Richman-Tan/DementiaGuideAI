import { KNOWLEDGE_CATEGORIES, FEATURED_RESOURCES } from '../constants/data';

class KnowledgeService {
  async searchResources(query) {
    // TODO: Connect to vector search / RAG pipeline backed by dementia-care corpus
    await new Promise(r => setTimeout(r, 400));
    return FEATURED_RESOURCES.filter(r =>
      r.title.toLowerCase().includes(query.toLowerCase()) ||
      r.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    );
  }

  async getCategories() {
    return KNOWLEDGE_CATEGORIES;
  }

  async getCategoryResources(categoryId) {
    await new Promise(r => setTimeout(r, 300));
    return FEATURED_RESOURCES;
  }

  async getFeaturedResources() {
    return FEATURED_RESOURCES;
  }
}

export const knowledgeService = new KnowledgeService();
