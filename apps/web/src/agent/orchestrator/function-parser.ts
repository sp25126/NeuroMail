import { ToolCall } from "../tools/definitions";

/**
 * Parse function calls from AI response text
 * Handles multiple formats and edge cases
 */
export class FunctionCallParser {
    /**
     * Parse all function calls from text
     */
    /**
     * Parsing logic for AI responses and User Slash Commands
     */
    static parse(text: string, availableTools: any[]): ToolCall[] {
        // Safe tool names extraction
        const toolNames = availableTools?.map((t) => typeof t === 'string' ? t : (t.id || t.name)) || [];

        // 1. Check for Slash Command (High Priority)
        const slashCommand = this.parseSlashCommand(text);
        if (slashCommand) {
            return [slashCommand];
        }

        // 2. Try parsing explicit calls: toolName({ ... })
        const explicitCalls = this.parseExplicitCalls(text, toolNames);
        if (explicitCalls.length > 0) return explicitCalls;

        // 3. Try parsing JSON block (for some models)
        try {
            const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const jsonContent = jsonMatch[1] || jsonMatch[0];
                const parsed = JSON.parse(jsonContent);

                // Handle single tool call object
                if (parsed.tool && parsed.parameters) {
                    return [{
                        id: `call_${Date.now()}`,
                        name: parsed.tool,
                        arguments: parsed.parameters
                    }];
                }
                // Handle array of tool calls
                if (Array.isArray(parsed)) {
                    return parsed.map((call: any) => ({
                        id: call.id || `call_${Date.now()}_${Math.random()}`,
                        name: call.name || call.tool,
                        arguments: call.arguments || call.parameters || {}
                    }));
                }
            }
        } catch (e) {
            // Ignore JSON parse errors
        }

        // 4. Fallback to Simple Calls
        const simpleCalls = this.parseSimpleCalls(text, toolNames);
        if (simpleCalls.length > 0) return simpleCalls;

        // 5. Fallback to Mentioned Calls
        return this.parseMentionedCalls(text, toolNames);
    }

    /**
     * Parse slash commands: /toolName args
     */
    private static parseSlashCommand(text: string): ToolCall | null {
        const trimmed = text.trim();
        if (!trimmed.startsWith("/")) return null;

        // Matches: /toolName { json_args } OR /toolName simple args
        const match = trimmed.match(/^\/([a-zA-Z0-9_]+)(?:\s+(.*))?$/);
        if (!match) return null;

        const toolName = match[1];
        const argsString = match[2] || "";

        let args: any = {};

        if (argsString) {
            // Try to parse as JSON first (for complex args like execute_js)
            try {
                // If it looks like an object, wrap/parse it
                if (argsString.trim().startsWith("{")) {
                    args = JSON.parse(argsString);
                } else {
                    args = this.parseArguments(argsString);
                }
            } catch (e) {
                // Fallback to loose regex parsing
                args = this.parseArguments(argsString);
            }
        }

        return {
            id: `slash_${Date.now()}`,
            name: toolName as any,
            arguments: args
        };
    }

    /**
     * Parse explicit function calls with balanced bracket matching
     */
    private static parseExplicitCalls(text: string, availableTools: string[]): ToolCall[] {
        const calls: ToolCall[] = [];
        const seenCalls = new Set<string>();

        // STEP 1: Aggressive cleaning of text from code blocks, prefixes, and quote markers
        let cleanText = text
            .replace(/```\w*\n?|```/g, "") // Remove code block markers
            .replace(/^(You|AI|Assistant|Assistant:):\s*/gim, "") // Remove conversational prefixes
            .replace(/^>\s*/gm, "") // Remove quote markers
            .replace(/\n\n+/g, "\n") // Collapse multiple newlines
            .trim();

        console.log("🧹 [PARSER] Cleaned text for explicit calls:", cleanText.substring(0, 100));

        for (const toolName of availableTools) {
            // Find all occurrences of toolName(
            let index = 0;
            while ((index = cleanText.indexOf(toolName + "(", index)) !== -1) {
                const startParams = index + toolName.length;
                let balance = 0;
                let found = false;
                let endParams = -1;

                for (let i = startParams; i < cleanText.length; i++) {
                    if (cleanText[i] === "(") balance++;
                    if (cleanText[i] === ")") balance--;

                    if (balance === 0) {
                        endParams = i + 1;
                        found = true;
                        break;
                    }
                }

                if (found && endParams !== -1) {
                    const fullMatch = cleanText.substring(index, endParams);
                    const callKey = `${toolName}:${fullMatch}`;

                    if (!seenCalls.has(callKey)) {
                        seenCalls.add(callKey);
                        // Extract content between first ( and last )
                        const argsString = cleanText.substring(startParams + 1, endParams - 1).trim();

                        try {
                            const args = this.parseArguments(argsString);
                            calls.push({
                                id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                name: toolName as any,
                                arguments: args,
                            });
                        } catch (err) {
                            console.error(`❌ [PARSER] Failed to parse args for ${toolName}:`, err);
                        }
                    }
                }
                index = index + 1; // Move past one character to keep searching
            }
        }

        return calls;
    }

    /**
     * Find matching closing bracket with nesting support
     */
    private static findClosingBracket(text: string, openIndex: number): number {
        let depth = 0;
        for (let i = openIndex; i < text.length; i++) {
            if (text[i] === '(') depth++;
            else if (text[i] === ')') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    /**
     * Parse simple function calls: functionName(value1, value2)
     */
    private static parseSimpleCalls(text: string, availableTools: string[]): ToolCall[] {
        const calls: ToolCall[] = [];

        for (const toolName of availableTools) {
            // Match: toolName() or toolName(arg1, arg2)
            const pattern = new RegExp(`${toolName}\\s*\\(([^)]*)\\)`, 'gi');
            let match;

            while ((match = pattern.exec(text)) !== null) {
                const argsString = match[1].trim();

                calls.push({
                    id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: toolName as any,
                    arguments: argsString ? { value: argsString.replace(/['"]/g, '') } : {},
                });

                console.log("✅ [PARSER] Parsed simple call:", toolName);
            }
        }

        return calls;
    }

    /**
     * Parse mentioned function names
     */
    private static parseMentionedCalls(text: string, availableTools: string[]): ToolCall[] {
        const calls: ToolCall[] = [];
        const textLower = text.toLowerCase();

        for (const toolName of availableTools) {
            if (textLower.includes(toolName.toLowerCase())) {
                calls.push({
                    id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: toolName as any,
                    arguments: {},
                });

                console.log("✅ [PARSER] Parsed mentioned call:", toolName);
            }
        }

        return calls;
    }

    /**
     * Parse arguments string into object
     */
    private static parseArguments(argsString: string): Record<string, any> {
        const args: Record<string, any> = {};

        if (!argsString.trim()) return args;

        // Try JSON parse first with newline sanitization
        try {
            // Escape newlines in strings to valid JSON format
            const sanitized = argsString.replace(/\n/g, "\\n");
            return JSON.parse(`{${sanitized}}`);
        } catch {
            // Fall back to robust regex parsing
        }

        // Regex to match key:value pairs, respecting quotes
        // Matches: key: "value", key: 'value', key: unquoted_value
        const regex = /([a-zA-Z0-9_]+)\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,]+))/g;

        let match;
        while ((match = regex.exec(argsString)) !== null) {
            const key = match[1];
            let value = match[2] || match[3] || match[4];

            if (value) {
                value = value.trim();
                // Handle escape sequences
                if (match[2] !== undefined) { // Double quoted
                    value = value.replace(/\\"/g, '"').replace(/\\n/g, '\n');
                } else if (match[3] !== undefined) { // Single quoted
                    value = value.replace(/\\'/g, "'").replace(/\\n/g, '\n');
                }
            }

            args[key] = value;
        }

        return args;
    }
}
