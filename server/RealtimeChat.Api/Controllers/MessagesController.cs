using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using RealtimeChat.Api.Data;
using RealtimeChat.Api.Models;
using RealtimeChat.Api.Services;
using RealtimeChat.Api.Hubs;
using System.Text.RegularExpressions;

namespace RealtimeChat.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MessagesController(AppDbContext db, IFileStorage storage, IHubContext<ChatHub> hub) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public record SendDto(Guid ConversationId, string Content, MessageType Type, Guid? ParentMessageId, int? EphemeralSeconds, string? Metadata);

    [HttpPost]
    public async Task<IActionResult> Send([FromBody] SendDto dto)
    {
        var member = await db.ConversationMembers.FirstOrDefaultAsync(cm => cm.ConversationId == dto.ConversationId && cm.UserId == UserId);
        if (member == null) return Forbid();
        var msg = new Message
        {
            ConversationId = dto.ConversationId,
            SenderId = UserId,
            Content = dto.Content,
            Type = dto.Type,
            ParentMessageId = dto.ParentMessageId,
            EphemeralExpiresAt = dto.EphemeralSeconds.HasValue ? DateTime.UtcNow.AddSeconds(dto.EphemeralSeconds.Value) : null,
            Metadata = dto.Metadata
        };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();
        // Extract mentions and notify
        var mentioned = await AddMentionsAsync(msg, dto.Content);
        var sender = await db.Users.FindAsync(UserId);
        await hub.Clients.Group($"conv:{dto.ConversationId}").SendAsync("message", new
        {
            msg.Id,
            msg.ConversationId,
            msg.SenderId,
            SenderUsername = sender!.Username,
            SenderDisplayName = sender.DisplayName,
            SenderAvatarUrl = sender.AvatarUrl,
            msg.Content,
            msg.Type,
            msg.ParentMessageId,
            msg.CreatedAt,
            msg.EphemeralExpiresAt,
            msg.Metadata
        });
        // Notify mentioned users directly
        foreach (var uid in mentioned)
        {
            await hub.Clients.User(uid.ToString()).SendAsync("mention", new
            {
                msg.Id,
                msg.ConversationId,
                msg.SenderId,
                SenderUsername = sender!.Username,
                SenderDisplayName = sender.DisplayName,
                SenderAvatarUrl = sender.AvatarUrl,
                msg.Content,
                msg.Type,
                msg.ParentMessageId,
                msg.CreatedAt,
                msg.EphemeralExpiresAt,
                msg.Metadata
            });
        }
        return Ok(new { msg.Id, msg.CreatedAt });
    }

    [HttpGet("{conversationId:guid}")]
    public async Task<IActionResult> History(Guid conversationId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var member = await db.ConversationMembers.FirstOrDefaultAsync(cm => cm.ConversationId == conversationId && cm.UserId == UserId);
        if (member == null) return Forbid();
        var query = db.Messages.Where(m => m.ConversationId == conversationId && !m.IsDeleted)
            .OrderByDescending(m => m.CreatedAt);
        var total = await query.CountAsync();
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(m => new
            {
                m.Id,
                m.Content,
                m.Type,
                m.SenderId,
                SenderUsername = m.Sender!.Username,
                SenderDisplayName = m.Sender!.DisplayName,
                SenderAvatarUrl = m.Sender!.AvatarUrl,
                m.CreatedAt,
                m.EditedAt,
                m.ParentMessageId,
                m.EphemeralExpiresAt,
                m.IsPinned,
                m.Metadata,
                Reactions = m.Reactions.GroupBy(r => r.Emoji).Select(g => new { Emoji = g.Key, Count = g.Count() }),
                MyReactions = m.Reactions.Where(r => r.UserId == UserId).Select(r => r.Emoji)
            })
            .ToListAsync();
        return Ok(new { total, page, pageSize, items });
    }

    [HttpPost("{id:guid}/reactions")]
    public async Task<IActionResult> React(Guid id, [FromBody] string emoji)
    {
        var msg = await db.Messages.FindAsync(id);
        if (msg == null) return NotFound();
        var exists = await db.MessageReactions.FindAsync(id, UserId, emoji);
        if (exists == null)
        {
            db.MessageReactions.Add(new MessageReaction { MessageId = id, UserId = UserId, Emoji = emoji });
            await db.SaveChangesAsync();
            await hub.Clients.Group($"conv:{msg.ConversationId}").SendAsync("reaction", new { messageId = id, emoji, userId = UserId, op = "add" });
        }
        return NoContent();
    }

    [HttpDelete("{id:guid}/reactions/{emoji}")]
    public async Task<IActionResult> Unreact(Guid id, string emoji)
    {
        var msg = await db.Messages.FindAsync(id);
        if (msg == null) return NotFound();
        var exists = await db.MessageReactions.FindAsync(id, UserId, emoji);
        if (exists != null)
        {
            db.MessageReactions.Remove(exists);
            await db.SaveChangesAsync();
            await hub.Clients.Group($"conv:{msg.ConversationId}").SendAsync("reaction", new { messageId = id, emoji, userId = UserId, op = "remove" });
        }
        return NoContent();
    }

    public class UploadDto
    {
        public Guid ConversationId { get; set; }
        public IFormFile File { get; set; } = default!;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(100_000_000)]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Upload([FromForm] UploadDto dto)
    {
        var conversationId = dto.ConversationId;
        var file = dto.File;
        var member = await db.ConversationMembers.FirstOrDefaultAsync(cm => cm.ConversationId == conversationId && cm.UserId == UserId);
        if (member == null) return Forbid();
        if (file == null || file.Length == 0) return BadRequest();

        await using var stream = file.OpenReadStream();
        var url = await storage.SaveAsync(stream, file.FileName, file.ContentType);
        var msg = new Message
        {
            ConversationId = conversationId,
            SenderId = UserId,
            Type = file.ContentType.StartsWith("image/") ? MessageType.Image : MessageType.File,
            Content = file.FileName,
            Metadata = url
        };
        db.Messages.Add(msg);
        db.Attachments.Add(new Attachment
        {
            Message = msg,
            FileName = file.FileName,
            ContentType = file.ContentType,
            Size = file.Length,
            Url = url
        });
        await db.SaveChangesAsync();
        var sender2 = await db.Users.FindAsync(UserId);
        await hub.Clients.Group($"conv:{conversationId}").SendAsync("message", new
        {
            msg.Id,
            msg.ConversationId,
            msg.SenderId,
            SenderUsername = sender2!.Username,
            SenderDisplayName = sender2.DisplayName,
            SenderAvatarUrl = sender2.AvatarUrl,
            msg.Content,
            msg.Type,
            msg.ParentMessageId,
            msg.CreatedAt,
            msg.EphemeralExpiresAt,
            msg.Metadata
        });
        return Ok(new { msg.Id, url });
    }

    private async Task<List<Guid>> AddMentionsAsync(Message msg, string content)
    {
        var result = new List<Guid>();
        if (string.IsNullOrWhiteSpace(content)) return result;
        var isAll = content.Contains("@all") || content.Contains("@here");
        if (isAll)
        {
            var members = await db.ConversationMembers.Where(cm => cm.ConversationId == msg.ConversationId).Select(cm => cm.UserId).ToListAsync();
            foreach (var uid in members.Distinct())
            {
                db.Mentions.Add(new Mention { MessageId = msg.Id, UserId = uid, IsAll = true });
                if (uid != msg.SenderId) result.Add(uid);
            }
            return result.Distinct().ToList();
        }
        var rx = new Regex(@"@([A-Za-z0-9_]{2,50})", RegexOptions.Compiled);
        var matches = rx.Matches(content);
        if (matches.Count == 0) return result;
        var usernames = matches.Select(m => m.Groups[1].Value).Distinct().ToList();
        var users = await db.Users.Where(u => usernames.Contains(u.Username)).Select(u => new { u.Id, u.Username }).ToListAsync();
        foreach (var u in users)
        {
            db.Mentions.Add(new Mention { MessageId = msg.Id, UserId = u.Id, IsAll = false });
            if (u.Id != msg.SenderId) result.Add(u.Id);
        }
        return result.Distinct().ToList();
    }

    [HttpPost("{conversationId:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid conversationId)
    {
        var isMember = await db.ConversationMembers.AnyAsync(cm => cm.ConversationId == conversationId && cm.UserId == UserId);
        if (!isMember) return Forbid();
        var unreadIds = await db.Messages
            .Where(m => m.ConversationId == conversationId && !db.MessageReads.Any(r => r.MessageId == m.Id && r.UserId == UserId))
            .Select(m => m.Id)
            .ToListAsync();
        foreach (var mid in unreadIds)
        {
            db.MessageReads.Add(new MessageRead { MessageId = mid, UserId = UserId });
        }
        if (unreadIds.Count > 0) await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("mentions")]
    public async Task<IActionResult> Mentions([FromQuery] bool unreadOnly = true, [FromQuery] int page=1, [FromQuery] int pageSize=50)
    {
        var query = db.Mentions
            .Where(m => m.UserId == UserId)
            .Join(db.Messages, m => m.MessageId, m2 => m2.Id, (m, m2) => new { m, msg = m2 });
        if (unreadOnly)
        {
            query = query.Where(x => !db.MessageReads.Any(r => r.MessageId == x.msg.Id && r.UserId == UserId));
        }
        var items = await query
            .OrderByDescending(x => x.msg.CreatedAt)
            .Skip((page-1)*pageSize).Take(pageSize)
            .Select(x => new {
                x.msg.Id,
                x.msg.ConversationId,
                x.msg.SenderId,
                SenderUsername = x.msg.Sender.Username,
                SenderDisplayName = x.msg.Sender.DisplayName,
                SenderAvatarUrl = x.msg.Sender.AvatarUrl,
                x.msg.Content,
                x.msg.Type,
                x.msg.CreatedAt,
                x.msg.Metadata
            })
            .ToListAsync();
        return Ok(items);
    }

    [HttpGet("{conversationId:guid}/search")]
    public async Task<IActionResult> Search(Guid conversationId, [FromQuery] string q, [FromQuery] int page=1, [FromQuery] int pageSize=50)
    {
        var isMember = await db.ConversationMembers.AnyAsync(cm => cm.ConversationId == conversationId && cm.UserId == UserId);
        if (!isMember) return Forbid();
        if (string.IsNullOrWhiteSpace(q)) return Ok(Array.Empty<object>());
        var query = db.Messages
            .Where(m => m.ConversationId == conversationId && !m.IsDeleted && m.Content.ToLower().Contains(q.ToLower()))
            .OrderByDescending(m => m.CreatedAt);
        var items = await query.Skip((page-1)*pageSize).Take(pageSize)
            .Select(m => new {
                m.Id,
                m.Content,
                m.Type,
                m.SenderId,
                SenderUsername = m.Sender!.Username,
                SenderDisplayName = m.Sender!.DisplayName,
                SenderAvatarUrl = m.Sender!.AvatarUrl,
                m.CreatedAt,
                m.Metadata
            })
            .ToListAsync();
        return Ok(items);
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Edit(Guid id, [FromBody] string content)
    {
        var msg = await db.Messages.FindAsync(id);
        if (msg == null || msg.SenderId != UserId) return Forbid();
        msg.Content = content;
        msg.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> SoftDelete(Guid id)
    {
        var msg = await db.Messages.FindAsync(id);
        if (msg == null || msg.SenderId != UserId) return Forbid();
        msg.IsDeleted = true;
        await db.SaveChangesAsync();
        return NoContent();
    }
}
