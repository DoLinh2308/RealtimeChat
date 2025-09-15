namespace RealtimeChat.Api.Models;

public enum ConversationType
{
    Direct = 0,
    Group = 1,
    Channel = 2
}

public enum ConversationRole
{
    Owner = 0,
    Admin = 1,
    Member = 2
}

public class Conversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public ConversationType Type { get; set; }
    public string? Description { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ConversationMember> Members { get; set; } = new List<ConversationMember>();
}

public class ConversationMember
{
    public Guid ConversationId { get; set; }
    public Conversation Conversation { get; set; } = default!;

    public Guid UserId { get; set; }
    public User User { get; set; } = default!;

    public ConversationRole Role { get; set; } = ConversationRole.Member;
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}

