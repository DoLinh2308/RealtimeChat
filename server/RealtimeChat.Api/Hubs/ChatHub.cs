using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using RealtimeChat.Api.Data;
using RealtimeChat.Api.Models;
using RealtimeChat.Api.Services;

namespace RealtimeChat.Api.Hubs;

[Authorize]
public class ChatHub(AppDbContext db, PresenceService presence) : Hub
{
    private Guid UserId => Guid.Parse(Context.User!.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public override async Task OnConnectedAsync()
    {
        presence.UserConnected(UserId, Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        presence.UserDisconnected(UserId, Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinConversation(Guid conversationId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(conversationId));
    }

    public async Task LeaveConversation(Guid conversationId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(conversationId));
    }

    public async Task Typing(Guid conversationId, bool isTyping)
    {
        await Clients.Group(GroupName(conversationId)).SendAsync("typing", new { conversationId, userId = UserId, isTyping });
    }

    public async Task SendMessage(Guid conversationId, string content, MessageType type = MessageType.Text, Guid? parentMessageId = null, int? ephemeralSeconds = null, string? metadata = null)
    {
        var sender = await db.Users.FindAsync(UserId);
        var message = new Message
        {
            ConversationId = conversationId,
            SenderId = UserId,
            Content = content,
            Type = type,
            ParentMessageId = parentMessageId,
            EphemeralExpiresAt = ephemeralSeconds.HasValue ? DateTime.UtcNow.AddSeconds(ephemeralSeconds.Value) : null,
            Metadata = metadata
        };
        db.Messages.Add(message);
        await db.SaveChangesAsync();
        await Clients.Group(GroupName(conversationId)).SendAsync("message", new
        {
            message.Id,
            message.ConversationId,
            message.SenderId,
            SenderUsername = sender!.Username,
            SenderDisplayName = sender.DisplayName,
            SenderAvatarUrl = sender.AvatarUrl,
            message.Content,
            message.Type,
            message.ParentMessageId,
            message.CreatedAt,
            message.EphemeralExpiresAt,
            message.Metadata
        });
    }

    public async Task Read(Guid conversationId, Guid messageId)
    {
        var read = await db.MessageReads.FindAsync(messageId, UserId);
        if (read == null)
        {
            db.MessageReads.Add(new MessageRead { MessageId = messageId, UserId = UserId });
            await db.SaveChangesAsync();
        }
        await Clients.Group(GroupName(conversationId)).SendAsync("read", new { conversationId, messageId, userId = UserId });
    }

    // WebRTC signaling
    public async Task SendOffer(Guid toUserId, object offer)
        => await Clients.User(toUserId.ToString()).SendAsync("webrtc/offer", new { from = UserId, offer });

    public async Task SendAnswer(Guid toUserId, object answer)
        => await Clients.User(toUserId.ToString()).SendAsync("webrtc/answer", new { from = UserId, answer });

    public async Task SendIceCandidate(Guid toUserId, object candidate)
        => await Clients.User(toUserId.ToString()).SendAsync("webrtc/candidate", new { from = UserId, candidate });

    private static string GroupName(Guid id) => $"conv:{id}";
}
