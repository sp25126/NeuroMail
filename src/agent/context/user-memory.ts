import { db } from "@/lib/db";
import { createLogger } from "../observability/logger";

const logger = createLogger("UserMemory");

export class UserMemoryService {
    /**
     * Extract and store learned information from conversation
     */
    async learnFromConversation(
        userId: string,
        conversation: Array<{ role: string; content: string }>
    ): Promise<void> {
        const entities = this.extractEntities(conversation);

        for (const entity of entities) {
            await this.storeEntity(userId, entity);
        }

        if (entities.length > 0) {
            logger.info("Learned from conversation", {
                userId,
                entitiesCount: entities.length,
                entities: entities.map(e => `${e.type}:${e.value}`),
            });
        }
    }

    /**
     * Extract entities (names, email addresses, companies)
     */
    private extractEntities(conversation: any[]): Array<{
        type: string;
        value: string;
        context: string;
    }> {
        const entities: any[] = [];
        const seen = new Set<string>();

        conversation.forEach((turn) => {
            if (turn.role !== "user") return;

            // Extract email addresses
            const emails = turn.content.match(
                /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
            );
            if (emails) {
                emails.forEach((email: string) => {
                    const key = `email:${email.toLowerCase()}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        entities.push({
                            type: "email",
                            value: email.toLowerCase(),
                            context: turn.content,
                        });
                    }
                });
            }

            // Extract person names (capitalized words, 2+ words preferred)
            const names = turn.content.match(
                /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g
            );
            if (names) {
                names.forEach((name: string) => {
                    if (name.length > 2 && !this.isCommonWord(name)) {
                        const key = `person:${name}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            entities.push({
                                type: "person",
                                value: name,
                                context: turn.content,
                            });
                        }
                    }
                });
            }
        });

        return entities;
    }

    /**
     * Store entity in user memory
     */
    private async storeEntity(
        userId: string,
        entity: { type: string; value: string; context: string }
    ): Promise<void> {
        try {
            await db.execute(
                `INSERT INTO user_memory (user_id, entity_type, entity_value, context, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(user_id, entity_type, entity_value) DO UPDATE SET
                   context = excluded.context,
                   updated_at = excluded.updated_at,
                   usage_count = usage_count + 1`,
                [
                    userId,
                    entity.type,
                    entity.value,
                    entity.context,
                    new Date().toISOString(),
                    new Date().toISOString(),
                ]
            );
        } catch (error: any) {
            // Don't crash on memory storage failure
            logger.warn("Failed to store entity", {
                entity: entity.value,
                error: error.message,
            });
        }
    }

    /**
     * Get user's known entities for context injection
     */
    async getUserEntities(
        userId: string,
        type?: string
    ): Promise<Array<{ entity_type: string; entity_value: string; usage_count: number }>> {
        try {
            const query = type
                ? "SELECT entity_type, entity_value, usage_count FROM user_memory WHERE user_id = ? AND entity_type = ? ORDER BY usage_count DESC LIMIT 20"
                : "SELECT entity_type, entity_value, usage_count FROM user_memory WHERE user_id = ? ORDER BY usage_count DESC LIMIT 50";

            const params = type ? [userId, type] : [userId];
            const rows = await db.query(query, params);
            return Array.isArray(rows) ? rows : [];
        } catch (error: any) {
            logger.warn("Failed to load user entities", { error: error.message });
            return [];
        }
    }

    private isCommonWord(word: string): boolean {
        const common = [
            "Email", "Gmail", "Inbox", "Sent", "Draft", "Drafts",
            "The", "This", "That", "Hello", "Thanks", "Please",
            "Today", "Tomorrow", "Yesterday", "Monday", "Tuesday",
            "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
            "Search", "Find", "Show", "Open", "Reply", "Forward",
            "Delete", "Compose", "Send", "Mark", "Unread", "Read",
            "Trash", "Starred", "Archive",
        ];
        return common.includes(word);
    }
}

export const userMemory = new UserMemoryService();
