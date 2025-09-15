FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

ENV ASPNETCORE_URLS=http://+:8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY RealtimeChat.Api/RealtimeChat.Api.csproj RealtimeChat.Api/
RUN dotnet restore RealtimeChat.Api/RealtimeChat.Api.csproj
COPY . .
WORKDIR /src/RealtimeChat.Api
RUN dotnet publish -c Release -o /out

FROM base AS final
WORKDIR /app
COPY --from=build /out .
ENTRYPOINT ["dotnet", "RealtimeChat.Api.dll"]

