using Microsoft.EntityFrameworkCore;
using RealtimeChat.Api.Models;

namespace RealtimeChat.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<ConversationMember> ConversationMembers => Set<ConversationMember>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<MessageReaction> MessageReactions => Set<MessageReaction>();
    public DbSet<MessageRead> MessageReads => Set<MessageRead>();
    public DbSet<Mention> Mentions => Set<Mention>();
    public DbSet<Attachment> Attachments => Set<Attachment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("uuid-ossp");

        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(x => x.Username).IsUnique();
        });

        modelBuilder.Entity<ConversationMember>()
            .HasKey(cm => new { cm.ConversationId, cm.UserId });

        modelBuilder.Entity<MessageReaction>()
            .HasKey(r => new { r.MessageId, r.UserId, r.Emoji });

        modelBuilder.Entity<MessageRead>()
            .HasKey(r => new { r.MessageId, r.UserId });

        modelBuilder.Entity<Mention>()
            .HasKey(m => new { m.MessageId, m.UserId });
    }
}

