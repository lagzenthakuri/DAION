import { GoogleGenAI, Type } from "@google/genai";
import { ProjectFile, TestResult } from "../types";

const getAiClient = () => {
  // Use the environment variable as per instructions
  const apiKey = process.env.API_KEY; 
  if (!apiKey) {
    throw new Error("API_KEY environment variable is not set.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateProjectPlan = async (prompt: string): Promise<{ files: ProjectFile[], planSummary: string }> => {
  const ai = getAiClient();
  const modelId = "gemini-3-pro-preview";

  const systemInstruction = `You are a world-class senior software architect. 
  Your goal is to break down a product request into a minimal but functional file structure.
  Return the response as a JSON object containing a list of files and a brief plan summary.
  Each file should have a name, language, and empty content string.
  Focus on modern React/TypeScript/Tailwind stack unless specified otherwise.`;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `Plan a software project for: ${prompt}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            files: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  language: { type: Type.STRING },
                  content: { type: Type.STRING },
                  status: { type: Type.STRING, enum: ['pending'] }
                },
                required: ['name', 'language', 'content', 'status']
              }
            },
            planSummary: { type: Type.STRING }
          },
          required: ['files', 'planSummary']
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    console.error("Error generating plan:", error);
    throw error;
  }
};

export const generateFileContent = async (filename: string, projectDescription: string, otherFiles: ProjectFile[]): Promise<string> => {
  const ai = getAiClient();
  // Using Flash for speed on individual file generation, but thinking enabled for quality
  const modelId = "gemini-3-flash-preview"; 

  const context = otherFiles.map(f => `${f.name}: ${f.content ? '(Content exists)' : '(Empty)'}`).join('\n');

  const systemInstruction = `You are an expert developer. Write the full, working code for the file: ${filename}.
  The project is: ${projectDescription}.
  Context of other files:
  ${context}
  
  Return ONLY the code for the file. No markdown code blocks, just raw text.`;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `Generate code for ${filename}`,
      config: {
        systemInstruction,
        // thinkingConfig: { thinkingBudget: 1024 } // Optional: Enable thinking for complex logic
      }
    });

    let text = response.text || "";
    // Strip markdown code blocks if the model adds them despite instructions
    text = text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
    return text;
  } catch (error) {
    console.error(`Error generating ${filename}:`, error);
    return `// Error generating content for ${filename}`;
  }
};

export const runAutonomousTests = async (files: ProjectFile[]): Promise<{ results: TestResult[], qualityScore: number, vibeCheck: { degraded: boolean, reason: string } }> => {
  const ai = getAiClient();
  const modelId = "gemini-3-pro-preview"; // Use Pro for reasoning about code quality

  const filesContext = files.map(f => `--- FILE: ${f.name} ---\n${f.content}\n`).join('\n');

  const systemInstruction = `You are a QA Engineer and Code Reviewer. 
  Analyze the provided code files. 
  
  Check for:
  1. Logic bugs and syntax errors (simulated tests).
  2. SYSTEM VIBE DEGRADATION:
     - STRICTLY check for Code Duplication. If multiple components or functions share significant logic, flag it immediately.
     - "Hacky" or short-sighted implementations.
     - UX inconsistencies (e.g. mixed styling, poor accessibility).
     - Spaghetti code.
  
  Return a JSON object with:
  1. qualityScore (0-100).
  2. vibeCheck: { degraded: boolean, reason: string }. Set degraded to true if ANY of the vibe degradation signs are present.
     If code duplication is found, the reason MUST clearly state "Code duplication detected" and specify where.
  3. results: A list of test results (testName, passed, message).`;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: `Review this project code:\n${filesContext}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            qualityScore: { type: Type.NUMBER },
            vibeCheck: {
                type: Type.OBJECT,
                properties: {
                    degraded: { type: Type.BOOLEAN },
                    reason: { type: Type.STRING }
                },
                required: ['degraded', 'reason']
            },
            results: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  testName: { type: Type.STRING },
                  passed: { type: Type.BOOLEAN },
                  message: { type: Type.STRING }
                },
                required: ['testName', 'passed', 'message']
              }
            }
          },
          required: ['qualityScore', 'results', 'vibeCheck']
        }
      }
    });

    if (response.text) {
        const data = JSON.parse(response.text);
        // Add IDs if missing
        const results = data.results.map((r: any, idx: number) => ({...r, id: `test-${idx}`}));
        return { 
            results, 
            qualityScore: data.qualityScore, 
            vibeCheck: data.vibeCheck || { degraded: false, reason: "Stable" } 
        };
    }
    throw new Error("No analysis received");
  } catch (error) {
    console.error("Test run failed:", error);
    return { results: [], qualityScore: 0, vibeCheck: { degraded: false, reason: "Error running checks" } };
  }
};

export const refactorCode = async (file: ProjectFile, errorContext: string): Promise<string> => {
  const ai = getAiClient();
  const modelId = "gemini-3-pro-preview";

  const systemInstruction = `You are a Senior Engineer fixing bugs and improving code quality.
  Refactor the code to fix the identified issues.
  If the issues mention "vibe degradation", duplication, or hacks, aggressively clean up the code.
  Return ONLY the new full code content.`;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: `File: ${file.name}\n\nCurrent Content:\n${file.content}\n\nIssues to fix:\n${errorContext}`,
    config: { systemInstruction }
  });

  let text = response.text || file.content;
  text = text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
  return text;
};

export const generateFinalReport = async (projectState: any): Promise<string> => {
    const ai = getAiClient();
    const modelId = "gemini-3-flash-preview";
    
    const summary = `
    Project: ${projectState.name}
    Iterations: ${projectState.iteration}
    Final Quality Score: ${projectState.qualityScore}
    Files Created: ${projectState.files.length}
    `;

    const response = await ai.models.generateContent({
        model: modelId,
        contents: `Write a professional technical report for this automated development cycle. Use Markdown.\n${summary}`,
    });

    return response.text || "Report generation failed.";
};

export const refineProject = async (prompt: string, files: ProjectFile[]): Promise<{ files: ProjectFile[], explanation: string }> => {
  const ai = getAiClient();
  const modelId = "gemini-3-pro-preview";

  const filesContext = files.map(f => `--- FILE: ${f.name} ---\n${f.content}\n`).join('\n');

  const systemInstruction = `You are a Full Stack Developer.
  User Request: "${prompt}"
  
  Review the current codebase. Identify which files need to be modified or created to satisfy the user request.
  Return a JSON object containing ONLY the files that need to change.
  Also return a short explanation.
  `;

  const response = await ai.models.generateContent({
      model: modelId,
      contents: `Current Codebase:\n${filesContext}`,
      config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
              type: Type.OBJECT,
              properties: {
                  changedFiles: {
                      type: Type.ARRAY,
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              name: { type: Type.STRING },
                              content: { type: Type.STRING },
                              language: { type: Type.STRING }
                          },
                          required: ['name', 'content', 'language']
                      }
                  },
                  explanation: { type: Type.STRING }
              },
              required: ['changedFiles', 'explanation']
          }
      }
  });

  if (response.text) {
      const data = JSON.parse(response.text);
      // Merge changes
      const newFiles = [...files];
      data.changedFiles.forEach((change: any) => {
          const idx = newFiles.findIndex(f => f.name === change.name);
          if (idx !== -1) {
              newFiles[idx] = { ...newFiles[idx], content: change.content };
          } else {
              newFiles.push({ ...change, status: 'created' });
          }
      });
      return { files: newFiles, explanation: data.explanation };
  }
  
  throw new Error("Refinement failed");
};
