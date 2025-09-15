import * as signalR from '@microsoft/signalr'

const API_ORIGIN = import.meta.env.VITE_API_URL || ''

export function createHubConnection(token) {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_ORIGIN}/hubs/chat`, { accessTokenFactory: () => token })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Information)
    .build()
  return connection
}
