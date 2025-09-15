using System.Collections.Concurrent;

namespace RealtimeChat.Api.Services;

public class PresenceService
{
    private readonly ConcurrentDictionary<Guid, HashSet<string>> _userConnections = new();

    public void UserConnected(Guid userId, string connectionId)
    {
        var set = _userConnections.GetOrAdd(userId, _ => new HashSet<string>());
        lock (set)
        {
            set.Add(connectionId);
        }
    }

    public void UserDisconnected(Guid userId, string connectionId)
    {
        if (_userConnections.TryGetValue(userId, out var set))
        {
            lock (set)
            {
                set.Remove(connectionId);
                if (set.Count == 0)
                    _userConnections.TryRemove(userId, out _);
            }
        }
    }

    public bool IsOnline(Guid userId) => _userConnections.ContainsKey(userId);
}

