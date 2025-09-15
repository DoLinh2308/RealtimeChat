using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RealtimeChat.Api.Data;
using RealtimeChat.Api.Models;
using RealtimeChat.Api.Services;

namespace RealtimeChat.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ConversationsController(AppDbContext db, IRoomCodeService roomCodes) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public record CreateDto(string Name, ConversationType Type, List<Guid>? Members);
    public record JoinDto(string Code);
    public record DirectDto(Guid UserId);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDto dto)
    {
        var conv = new Conversation { Name = dto.Name, Type = dto.Type };
        db.Conversations.Add(conv);
        db.ConversationMembers.Add(new ConversationMember { Conversation = conv, UserId = UserId, Role = ConversationRole.Owner });
        if (dto.Members != null)
        {
            foreach (var uid in dto.Members.Distinct())
            {
                if (uid == UserId) continue;
                db.ConversationMembers.Add(new ConversationMember { Conversation = conv, UserId = uid, Role = ConversationRole.Member });
            }
        }
        await db.SaveChangesAsync();
        var code = roomCodes.Generate(conv.Id);
        return Ok(new { conv.Id, conv.Name, conv.Type, Code = code });
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var convs = await db.ConversationMembers
            .Where(cm => cm.UserId == UserId)
            .Select(cm => new { cm.ConversationId, cm.Conversation.Name, cm.Conversation.Type })
            .ToListAsync();
        return Ok(convs);
    }

    // Discover conversations (simple: return all). In real apps, apply visibility rules.
    [HttpGet("discover")]
    public async Task<IActionResult> Discover()
    {
        var all = await db.Conversations
            .Select(c => new { c.Id, c.Name, c.Type })
            .ToListAsync();
        return Ok(all);
    }

    // Join as a member (self-service)
    [HttpPost("{id:guid}/join")]
    public async Task<IActionResult> Join(Guid id, [FromBody] JoinDto dto)
    {
        var exists = await db.Conversations.AnyAsync(c => c.Id == id);
        if (!exists) return NotFound();
        if (!roomCodes.Validate(id, dto.Code)) return BadRequest(new { message = "Invalid room code" });
        var already = await db.ConversationMembers.FindAsync(id, UserId);
        if (already == null)
        {
            db.ConversationMembers.Add(new ConversationMember { ConversationId = id, UserId = UserId, Role = ConversationRole.Member });
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    // Create or get direct conversation with another user
    [HttpPost("direct")]
    public async Task<IActionResult> Direct([FromBody] DirectDto dto)
    {
        if (dto.UserId == UserId) return BadRequest(new { message = "Cannot start direct chat with yourself" });
        var target = await db.Users.FindAsync(dto.UserId);
        if (target == null) return NotFound(new { message = "User not found" });

        var direct = await db.Conversations
            .Where(c => c.Type == ConversationType.Direct)
            .Where(c => db.ConversationMembers.Any(cm => cm.ConversationId == c.Id && cm.UserId == UserId)
                     && db.ConversationMembers.Any(cm => cm.ConversationId == c.Id && cm.UserId == dto.UserId))
            .Select(c => new { c.Id, c.Name, c.Type })
            .FirstOrDefaultAsync();

        if (direct != null)
            return Ok(direct);

        var conv = new Conversation { Name = target.DisplayName ?? target.Username, Type = ConversationType.Direct };
        db.Conversations.Add(conv);
        db.ConversationMembers.Add(new ConversationMember { Conversation = conv, UserId = UserId, Role = ConversationRole.Member });
        db.ConversationMembers.Add(new ConversationMember { Conversation = conv, UserId = dto.UserId, Role = ConversationRole.Member });
        await db.SaveChangesAsync();
        return Ok(new { conv.Id, conv.Name, conv.Type });
    }

    // Delete conversation (owner or admin only)
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var role = await db.ConversationMembers
            .Where(cm => cm.ConversationId == id && cm.UserId == UserId)
            .Select(cm => cm.Role)
            .FirstOrDefaultAsync();
        if (role != ConversationRole.Owner && role != ConversationRole.Admin)
            return Forbid();

        var conv = await db.Conversations.FindAsync(id);
        if (conv == null) return NotFound();
        db.Conversations.Remove(conv);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/members")]
    public async Task<IActionResult> AddMember(Guid id, [FromBody] Guid userId)
    {
        var isAdmin = await db.ConversationMembers.AnyAsync(cm => cm.ConversationId == id && cm.UserId == UserId && (cm.Role == ConversationRole.Owner || cm.Role == ConversationRole.Admin));
        if (!isAdmin) return Forbid();
        if (!await db.ConversationMembers.AnyAsync(cm => cm.ConversationId == id && cm.UserId == userId))
        {
            db.ConversationMembers.Add(new ConversationMember { ConversationId = id, UserId = userId, Role = ConversationRole.Member });
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    [HttpDelete("{id:guid}/members/{userId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid userId)
    {
        var isAdmin = await db.ConversationMembers.AnyAsync(cm => cm.ConversationId == id && cm.UserId == UserId && (cm.Role == ConversationRole.Owner || cm.Role == ConversationRole.Admin));
        if (!isAdmin) return Forbid();
        var cmember = await db.ConversationMembers.FindAsync(id, userId);
        if (cmember != null)
        {
            db.ConversationMembers.Remove(cmember);
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    [HttpPost("{id:guid}/leave")]
    public async Task<IActionResult> Leave(Guid id)
    {
        var cmember = await db.ConversationMembers.FindAsync(id, UserId);
        if (cmember != null)
        {
            db.ConversationMembers.Remove(cmember);
            await db.SaveChangesAsync();
        }
        return NoContent();
    }

    // List members of a conversation (for mentions/autocomplete)
    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> Members(Guid id)
    {
        var isMember = await db.ConversationMembers.AnyAsync(cm => cm.ConversationId == id && cm.UserId == UserId);
        if (!isMember) return Forbid();
        var members = await db.ConversationMembers
            .Where(cm => cm.ConversationId == id)
            .Select(cm => new { cm.UserId, cm.User.Username, cm.User.DisplayName, cm.User.AvatarUrl })
            .ToListAsync();
        return Ok(members);
    }

    [HttpGet("{id:guid}/code")]
    public async Task<IActionResult> Code(Guid id)
    {
        var isMember = await db.ConversationMembers.AnyAsync(cm => cm.ConversationId == id && cm.UserId == UserId);
        if (!isMember) return Forbid();
        var code = roomCodes.Generate(id);
        return Ok(new { Code = code });
    }
}
