using System.ComponentModel.DataAnnotations;

namespace RealtimeChat.Api.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(50)]
    public required string Username { get; set; }

    [MaxLength(100)]
    public string? DisplayName { get; set; }

    public string PasswordHash { get; set; } = string.Empty;

    public string? AvatarUrl { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? LastSeenAt { get; set; }
}

