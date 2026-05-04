export const KNOWLEDGE_CATEGORIES = [
  {
    id: 'caregiving',
    title: 'Caregiving Advice',
    description: 'Practical daily care tips and strategies',
    icon: 'heart',
    color: '#E8956D',
    colorMuted: '#FDF0E8',
    count: 7,
  },
  {
    id: 'clinical',
    title: 'Clinical Guidelines',
    description: 'Evidence-based medical recommendations',
    icon: 'medical-bag',
    color: '#4A7C8E',
    colorMuted: '#EBF3F6',
    count: 7,
  },
  {
    id: 'best-practices',
    title: 'Best Practices',
    description: 'Research-backed behavioural care approaches',
    icon: 'star',
    color: '#F0C070',
    colorMuted: '#FDF8EC',
    count: 7,
  },
  {
    id: 'communication',
    title: 'Communication',
    description: 'Connecting with loved ones with dementia',
    icon: 'chat',
    color: '#9B8DC4',
    colorMuted: '#F3F1FA',
    count: 7,
  },
  {
    id: 'home-safety',
    title: 'Home Safety',
    description: 'Making the home safe for someone with dementia',
    icon: 'home-alert',
    color: '#D4756B',
    colorMuted: '#FAECEA',
    count: 7,
  },
  {
    id: 'wellbeing',
    title: 'Carer Wellbeing',
    description: 'Supporting the health and resilience of family carers',
    icon: 'account-heart',
    color: '#7FB5A0',
    colorMuted: '#EEF7F4',
    count: 7,
  },
  {
    id: 'prevention',
    title: 'Prevention & Early Detection',
    description: 'Risk factors, warning signs, and brain health strategies',
    icon: 'brain',
    color: '#5B9BD5',
    colorMuted: '#EBF4FC',
    count: 7,
  },
];

export const FEATURED_RESOURCES = [
  {
    id: '1',
    title: 'Understanding the Stages of Dementia',
    category: 'Clinical Guidelines',
    readTime: '8 min read',
    type: 'article',
    tags: ['stages', 'diagnosis', 'progression'],
  },
  {
    id: '2',
    title: 'Creating a Safe Home Environment',
    category: 'Caregiving Advice',
    readTime: '6 min read',
    type: 'guide',
    tags: ['safety', 'home', 'daily care'],
  },
  {
    id: '3',
    title: 'Communicating with Memory Loss',
    category: 'Communication',
    readTime: '5 min read',
    type: 'article',
    tags: ['communication', 'behavior', 'connection'],
  },
  {
    id: '4',
    title: 'Carer Wellbeing and Burnout Prevention',
    category: 'Best Practices',
    readTime: '10 min read',
    type: 'guide',
    tags: ['self-care', 'burnout', 'support'],
  },
];

export const QUICK_QUESTIONS = [
  'How do I manage sundowning?',
  'What are early signs of dementia?',
  'How can I help with wandering?',
  'What medications are commonly used?',
  'How do I handle aggressive behavior?',
  'What respite care options are available?',
];

export const SAMPLE_MESSAGES = [
  {
    id: '1',
    role: 'assistant',
    text: "Hello! I'm Aria, your DementiaGuide AI assistant. I'm here to help you find information, answer questions, and provide support around dementia care. How can I help you today?",
    timestamp: new Date().toISOString(),
    sources: [],
  },
];

export const ACCESSIBILITY_SETTINGS = {
  textSize: 'medium',
  contrast: 'standard',
  audioEnabled: true,
  subtitlesEnabled: true,
  avatarEnabled: true,
  hapticFeedback: true,
  autoPlayResponses: false,
};
