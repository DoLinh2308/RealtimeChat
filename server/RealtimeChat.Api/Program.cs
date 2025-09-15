using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using RealtimeChat.Api.Data;
using RealtimeChat.Api.Hubs;
using RealtimeChat.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Configuration
var config = builder.Configuration;

// Add services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS (allow client on :3000 by default)
var originsFromConfig = config.GetSection("CORS:Origins").Get<string[]>() ?? Array.Empty<string>();
var singleOrigin = config["CORS:Origin"] ?? config["CORS__Origin"];
var defaultOrigins = new[] { "http://localhost:3000", "http://127.0.0.1:3000" };
var allowedOrigins = originsFromConfig.Length > 0
    ? originsFromConfig
    : (singleOrigin != null ? new[] { singleOrigin } : defaultOrigins);

builder.Services.AddCors(options =>
{
    options.AddPolicy("default", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// DbContext
var connectionString = config.GetConnectionString("Default")
                       ?? config["DATABASE_URL"];

if (string.IsNullOrWhiteSpace(connectionString))
{
    var defaultHost = builder.Environment.IsDevelopment() ? "localhost" : "postgres";
    connectionString = $"Host={defaultHost};Port=5432;Database=realtimechat;Username=postgres;Password=postgres";
}

builder.Services.AddDbContext<AppDbContext>(opt =>
{
    opt.UseNpgsql(connectionString);
});

// App services
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IFileStorage, LocalFileStorage>();
builder.Services.AddSingleton<PresenceService>();
builder.Services.AddSingleton<IRoomCodeService, RoomCodeService>();

// SignalR
builder.Services.AddSignalR();

// JWT Auth
var jwtKey = config["JWT:Key"] ?? config["JWT__Key"] ?? "super_dev_secret_change_me_super_dev_secret_change_me";
var jwtIssuer = config["JWT:Issuer"] ?? config["JWT__Issuer"] ?? "RealtimeChat";
var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
}).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = false,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtIssuer,
        IssuerSigningKey = key,
        ClockSkew = TimeSpan.FromSeconds(5)
    };
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            // Allow JWT via query for WebSocket (SignalR)
            var accessToken = context.Request.Query["access_token"].ToString();
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/chat"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

var app = builder.Build();

// Apply migrations automatically on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

// Pipeline
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("default");
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat");

app.Run();
