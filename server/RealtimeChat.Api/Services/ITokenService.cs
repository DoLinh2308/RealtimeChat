using RealtimeChat.Api.Models;

namespace RealtimeChat.Api.Services;

public interface ITokenService
{
    string CreateToken(User user);
}

