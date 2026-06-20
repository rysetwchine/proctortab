/**
 * Web search utility to fetch information about a topic
 * Uses DuckDuckGo's free API (no authentication required)
 */

export interface SearchResult {
  title: string;
  description: string;
  url: string;
}

/**
 * Search for information about a topic using DuckDuckGo API
 * Returns structured search results
 */
export async function searchTopicInfo(topic: string, maxResults: number = 5): Promise<string> {
  if (!topic.trim()) {
    return '';
  }

  try {
    // Using DuckDuckGo's instant answer API (free, no auth required)
    const encodedTopic = encodeURIComponent(topic);
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodedTopic}&format=json&no_redirect=1`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      console.warn('DuckDuckGo search failed');
      return '';
    }

    const data = await response.json();
    let context = '';

    // Add abstract/summary if available
    if (data.AbstractText) {
      context += `Summary: ${data.AbstractText}\n`;
    }

    // Add related topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      const relatedText = data.RelatedTopics
        .slice(0, maxResults)
        .map((item: any) => item.Text || item.FirstURL || '')
        .filter(Boolean)
        .join('; ');
      if (relatedText) {
        context += `Related: ${relatedText}\n`;
      }
    }

    // Add redirect info if available
    if (data.Redirect) {
      context += `See also: ${data.Redirect}\n`;
    }

    return context.trim();
  } catch (error) {
    console.error('Web search error:', error);
    return '';
  }
}

/**
 * Fetch structured data about a topic from multiple sources
 * This provides more context for question generation
 */
export async function fetchTopicContext(topic: string): Promise<string> {
  if (!topic.trim()) {
    return '';
  }

  try {
    const searchInfo = await searchTopicInfo(topic, 5);
    
    if (!searchInfo) {
      // Fallback: return the topic as-is
      return `Topic: ${topic}`;
    }

    return `Topic: ${topic}\n\nResearch Context:\n${searchInfo}`;
  } catch (error) {
    console.error('Error fetching topic context:', error);
    return `Topic: ${topic}`;
  }
}
