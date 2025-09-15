namespace RealtimeChat.Api.Services;

public interface IRoomCodeService
{
    string Generate(Guid conversationId);
    bool Validate(Guid conversationId, string? code);
}

