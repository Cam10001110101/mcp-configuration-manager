import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import * as fs from 'fs';

// Database file will be stored in the database/data directory
const DB_PATH = path.join(__dirname, 'data', 'profiles.db');

// Type definitions
interface Profile {
    id: number;
    name: string;
    config_path: string;
    backup_path: string;
    mcp_client_path: string | null;
    created_at: string;
    updated_at: string;
}

interface Configuration {
    id: number;
    profile_id: number;
    content: string;
    created_at: string;
}

// Ensure the directory exists synchronously
function ensureDbDirectory() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

class ProfileDatabase {
    private db!: Database.Database;
    private createProfileStmt!: Database.Statement;
    private saveConfigurationStmt!: Database.Statement;
    private getProfileStmt!: Database.Statement;
    private getAllProfilesStmt!: Database.Statement;
    private getLatestConfigurationStmt!: Database.Statement;
    private updateProfilePathsStmt!: Database.Statement;
    private deleteProfileStmt!: Database.Statement;
    private getProfileByNameStmt!: Database.Statement;
    private getProfileCountStmt!: Database.Statement;

    constructor() {
        ensureDbDirectory();
        this.db = new Database(DB_PATH);
        this.initialize();
    }

    private initialize() {
        // Create profiles table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                config_path TEXT NOT NULL,
                backup_path TEXT NOT NULL,
                mcp_client_path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        `);

        // Create configurations table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS configurations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE
            )
        `);

        // Enable foreign key support
        this.db.exec('PRAGMA foreign_keys = ON');

        // Prepare statements
        this.createProfileStmt = this.db.prepare(`
            INSERT INTO profiles (name, config_path, backup_path, mcp_client_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        this.saveConfigurationStmt = this.db.prepare(`
            INSERT INTO configurations (profile_id, content, created_at)
            VALUES (?, ?, ?)
        `);

        this.getProfileStmt = this.db.prepare(`
            SELECT * FROM profiles WHERE id = ?
        `);

        this.getAllProfilesStmt = this.db.prepare(`
            SELECT * FROM profiles ORDER BY created_at DESC
        `);

        this.getLatestConfigurationStmt = this.db.prepare(`
            SELECT content FROM configurations 
            WHERE profile_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `);

        this.updateProfilePathsStmt = this.db.prepare(`
            UPDATE profiles 
            SET config_path = ?,
                backup_path = ?,
                mcp_client_path = ?,
                updated_at = ?
            WHERE id = ?
        `);

        this.deleteProfileStmt = this.db.prepare(`
            DELETE FROM profiles WHERE id = ?
        `);

        this.getProfileByNameStmt = this.db.prepare(`
            SELECT * FROM profiles WHERE name = ?
        `);

        this.getProfileCountStmt = this.db.prepare(`
            SELECT COUNT(*) as count FROM profiles
        `);

        // Create default profile if no profiles exist
        this.ensureDefaultProfile();
    }

    private ensureDefaultProfile() {
        const result = this.getProfileCountStmt.get() as { count: number };
        if (result.count === 0) {
            // Get default paths
            const defaultConfigPath = path.join(app.getPath('appData'), 'Claude', 'claude_desktop_config.json');
            const defaultBackupPath = path.join(app.getPath('userData'), 'config-backups');

            // Create default profile
            const profileId = this.createProfile(
                'Default',
                defaultConfigPath,
                defaultBackupPath,
                null // No default MCP client path
            );

            // Check if the default config file exists
            let configContent = JSON.stringify({ mcpServers: {} });
            try {
                if (require('fs').existsSync(defaultConfigPath)) {
                    const existingContent = require('fs').readFileSync(defaultConfigPath, 'utf-8');
                    const existingConfig = JSON.parse(existingContent);
                    
                    // If the existing config has a valid mcpServers object, use it
                    if (existingConfig && existingConfig.mcpServers && typeof existingConfig.mcpServers === 'object') {
                        configContent = existingContent;
                        console.log('Using existing configuration for default profile');
                    }
                }
            } catch (err) {
                console.warn('Error reading existing config file:', err);
                // Continue with empty configuration
            }

            // Save the configuration
            this.saveConfiguration(profileId, configContent);
        }
    }

    createProfile(name: string, configPath: string, backupPath: string, mcpClientPath: string | null): number {
        const now = new Date().toISOString();
        const info = this.createProfileStmt.run(name, configPath, backupPath, mcpClientPath, now, now);
        return info.lastInsertRowid as number;
    }

    saveConfiguration(profileId: number, content: string): void {
        const now = new Date().toISOString();
        this.saveConfigurationStmt.run(profileId, content, now);
    }

    getProfile(id: number): Profile | undefined {
        return this.getProfileStmt.get(id) as Profile | undefined;
    }

    getProfileByName(name: string): Profile | undefined {
        return this.getProfileByNameStmt.get(name) as Profile | undefined;
    }

    getAllProfiles(): Profile[] {
        return this.getAllProfilesStmt.all() as Profile[];
    }

    getLatestConfiguration(profileId: number): string | null {
        const result = this.getLatestConfigurationStmt.get(profileId) as { content: string } | undefined;
        return result ? result.content : null;
    }

    updateProfilePaths(profileId: number, configPath: string, backupPath: string, mcpClientPath: string | null): void {
        const now = new Date().toISOString();
        this.updateProfilePathsStmt.run(configPath, backupPath, mcpClientPath, now, profileId);
    }

    deleteProfile(id: number): void {
        this.deleteProfileStmt.run(id);
    }

    close(): void {
        this.db.close();
    }
}

// Export a singleton instance
export const profileDb = new ProfileDatabase();
