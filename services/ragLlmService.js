// services/ragLlmService.js
import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const client = new Groq({
  apiKey: GROQ_API_KEY,
  dangerouslyAllowBrowser: true // Required for React Native environment
});

const SYSTEM_PROMPT = `You are a helpful portfolio assistant that provides clear, concise, and well-formatted responses.
When formatting responses:
1. Use natural, conversational language
2. Format numbers with appropriate currency symbols and commas
3. Use bullet points for lists
4. Highlight important numbers or percentages
5. Keep responses concise but informative
6. Use proper spacing and line breaks for readability
7. Format dates in a consistent, readable format
8. Use appropriate units (e.g., $ for money, % for percentages)
9. Round numbers appropriately (2 decimal places for money, whole numbers for counts)
10. Use clear section headers when presenting multiple pieces of information

Example formatting:
- For portfolio value: "Your total portfolio value is $285,801.88"
- For stock holdings: "You own 100 shares of Apple (AAPL) worth $17,500.00"
- For percentages: "Your portfolio has grown by 12.5% this year"
- For lists: "Your top holdings are:
  • Apple (AAPL): $17,500.00
  • Microsoft (MSFT): $15,200.00
  • Amazon (AMZN): $12,800.00"`;

/**
 * Gets a response from an LLM using RAG principles.
 * @param {string} userQuery - The original user query.
 * @param {Array<object>} retrievedContexts - Contexts retrieved from vector search.
 * Each context object should have `text_content`, `sql_query` (optional), and `similarity`.
 * @returns {Promise<object>} A promise that resolves to an object like { type: 'sql' | 'text' | 'unanswerable', content: string }.
 */
export async function getRagLLMResponse(userQuery, retrievedContexts) {
  try {
    const prompt = `${SYSTEM_PROMPT}

User Query: ${userQuery}

Retrieved Context:
${retrievedContexts.map(ctx => `- ${ctx.text_content}`).join('\n')}

Based on the user's query and the retrieved context, provide a clear and well-formatted response.`;

    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.7,
      max_tokens: 1024,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      return { type: 'error', content: 'No response from LLM' };
    }

    return { type: 'text', content: response };
  } catch (error) {
    console.error('Error in getRagLLMResponse:', error);
    return { type: 'error', content: 'Error getting response from LLM' };
  }
}

// You will also need a function to convert SQL results to a natural language response.
// This can be similar to the one in GeneralChatbox.js or `ragLlmService.js` in the thought process.
// For brevity, I'll assume you'll adapt the `formatSqlResultsToNL` from the previous thought block
// or the `getFormattedPortfolioTextResponseFromLLM` from GeneralChatbox.js.
// Let's call it `formatSQLResultsForChat` for this context.
export async function formatSQLResultsForChat(userQuery, sqlQuery, results) {
  try {
    const prompt = `${SYSTEM_PROMPT}

User Query: ${userQuery}

SQL Results:
${JSON.stringify(results, null, 2)}

Format these results in a clear, readable way that directly answers the user's query.`;

    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.7,
      max_tokens: 1024,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      return 'Error formatting results';
    }

    return response;
  } catch (error) {
    console.error('Error in formatSQLResultsForChat:', error);
    return 'Error formatting results';
  }
}