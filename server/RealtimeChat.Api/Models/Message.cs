namespace RealtimeChat.Api.Models;

public enum MessageType
{
    Text = 0,
    Image = 1,
    File = 2,
    Voice = 3,
    System = 4
}

public class Message
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public Conversation Conversation { get; set; } = default!;
    public Guid SenderId { get; set; }
    public User Sender { get; set; } = default!;

    public MessageType Type { get; set; } = MessageType.Text;
    public string Content { get; set; } = string.Empty; // text or caption
    public string? Metadata { get; set; } // attachment path, mime, duration, etc.

    public Guid? ParentMessageId { get; set; } // thread root
    public Message? ParentMessage { get; set; }

    public bool IsDeleted { get; set; }
    public bool IsPinned { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EditedAt { get; set; }

    public DateTime? EphemeralExpiresAt { get; set; }

    public ICollection<MessageReaction> Reactions { get; set; } = new List<MessageReaction>();
}

public class MessageReaction
{
    public Guid MessageId { get; set; }
    public Message Message { get; set; } = default!;
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;
    public string Emoji { get; set; } = ":+1:";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class MessageRead
{
    public Guid MessageId { get; set; }
    public Message Message { get; set; } = default!;
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;
    public DateTime ReadAt { get; set; } = DateTime.UtcNow;
}

public class Mention
{
    public Guid MessageId { get; set; }
    public Message Message { get; set; } = default!;
    public Guid UserId { get; set; }
    public User User { get; set; } = default!;
    public bool IsAll { get; set; }
}

public class Attachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MessageId { get; set; }
    public Message Message { get; set; } = default!;
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/octet-stream";
    public long Size { get; set; }
    public string Url { get; set; } = string.Empty;
}

