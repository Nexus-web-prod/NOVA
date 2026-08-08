-- Destructive Nova 7 reset.
-- Drop the tables as well as their data so an older table layout cannot survive
-- and conflict with the current Worker. D1_SCHEMA.sql recreates everything.
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS social_message_reactions;
DROP TABLE IF EXISTS social_typing;
DROP TABLE IF EXISTS social_messages;
DROP TABLE IF EXISTS social_group_invites;
DROP TABLE IF EXISTS social_channel_members;
DROP TABLE IF EXISTS friendships;
DROP TABLE IF EXISTS email_verifications;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS auth_rate_limits;
DROP TABLE IF EXISTS user_presence;
DROP TABLE IF EXISTS user_activity;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS site_banners;
DROP TABLE IF EXISTS site_maintenance;
DROP TABLE IF EXISTS device_bans;
DROP TABLE IF EXISTS proxy_navigation_logs;
DROP TABLE IF EXISTS admin_audit_logs;
DROP TABLE IF EXISTS user_plans;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS user_stats;
DROP TABLE IF EXISTS user_profiles;
DROP TABLE IF EXISTS social_channels;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS nova_schema_meta;

-- Retired Nova 6 tables. These are removed during a full reset so no account,
-- social, admin, or activity data is carried into the new backend.
DROP TABLE IF EXISTS nova_stream;
DROP TABLE IF EXISTS friend_requests;
DROP TABLE IF EXISTS social_unread;
DROP TABLE IF EXISTS friends;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS group_members;
DROP TABLE IF EXISTS group_invites;
DROP TABLE IF EXISTS nova_web_logs;
DROP TABLE IF EXISTS nova_kv;
DROP TABLE IF EXISTS nova_users;

PRAGMA foreign_keys = ON;
