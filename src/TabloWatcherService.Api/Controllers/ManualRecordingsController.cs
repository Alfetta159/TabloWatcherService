using TabloWatcherService.Api.Models;
using TabloWatcherService.Api.Services.Tablo;

namespace TabloWatcherService.Api.Controllers;

/// <summary>
/// The Manual page: manual recordings (a channel and time slot, once or weekly - see
/// <see cref="ManualProgram"/>) on "the" Tablo device (see <see cref="ICurrentTabloDeviceResolver"/>).
/// Unlike the guide-backed pages these read the device directly, since the guide cache only
/// knows a manual recording's individual slots, not the recording itself.
/// </summary>
[ApiController]
[Route("api/manual-recordings")]
public class ManualRecordingsController(
    ICurrentTabloDeviceResolver deviceResolver,
    IDeviceChannels deviceChannels,
    IAiringsStore airings) : ControllerBase
{
    private static readonly string[] DayNames =
        ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    // The longest the Tablo app offers for a manual recording is well under this; it's just a
    // sanity bound.
    private const int MaxDurationMinutes = 24 * 60;

    /// <summary>
    /// The Add dialog's input. <paramref name="Date"/> (yyyy-MM-dd) is for a one-off,
    /// <paramref name="Days"/> (lowercase day names) for a weekly repeat; the time is local to
    /// <paramref name="Timezone"/> (IANA, e.g. "America/Los_Angeles").
    /// </summary>
    public record CreateRequest(
        string Title,
        int ChannelId,
        bool Repeating,
        DateOnly? Date,
        string[]? Days,
        int Hour,
        int Minute,
        int DurationMinutes,
        string Timezone);

    /// <summary>Every manual recording on the device, by title.</summary>
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        try
        {
            var pathsResponse = await client.GetGuideProgramsAsync();
            if (!pathsResponse.IsSuccessStatusCode || pathsResponse.Content is null)
            {
                return pathsResponse.ToErrorResult();
            }

            var programs = await BatchAsync<ManualProgram>(client, pathsResponse.Content);
            if (programs is null)
            {
                return StatusCode(StatusCodes.Status502BadGateway);
            }

            var channels = await ChannelsByPathAsync();

            // Each one's next slot, if the guide cache has it yet - a just-created recording's
            // slots only show up there at the next guide refresh.
            var nextAirings = airings.GetScheduledAirings(DateTime.UtcNow, includeSkipped: true)
                .Where(s => s.Airing.ProgramPath is not null)
                .GroupBy(s => s.Airing.ProgramPath!)
                .ToDictionary(g => g.Key, g => g.First().Airing);

            return Ok(new
            {
                items = programs.Values
                    .OrderBy(p => p.Config.Title, StringComparer.CurrentCultureIgnoreCase)
                    .Select(p => Item(p, channels.GetValueOrDefault(p.Config.ChannelPath), nextAirings.GetValueOrDefault(p.Path))),
            });
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status502BadGateway);
        }
    }

    /// <summary>Sets up a manual recording.</summary>
    /// <returns>The new recording, as <see cref="Get"/> lists it.</returns>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRequest request)
    {
        if (Validate(request) is { } problem)
        {
            return ValidationProblem(new ValidationProblemDetails(problem));
        }

        var config = new ManualProgramConfig
        {
            Title = request.Title.Trim(),
            ChannelPath = $"/guide/channels/{request.ChannelId}",
            Duration = request.DurationMinutes * 60,
        };
        if (request.Repeating)
        {
            config.Kind = "recurring";
            config.Recurring = new ManualProgramRecurring
            {
                // In week order, however they were picked.
                Days = DayNames.Where(request.Days!.Contains).ToArray(),
                Hour = request.Hour,
                Minute = request.Minute,
                Timezone = request.Timezone,
            };
        }
        else
        {
            var date = request.Date!.Value;
            config.Kind = "once";
            config.Once = new ManualProgramOnce
            {
                Year = date.Year,
                Month = date.Month,
                Day = date.Day,
                Hour = request.Hour,
                Minute = request.Minute,
                Timezone = request.Timezone,
            };
        }

        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        try
        {
            var response = await client.CreateManualProgramAsync(new CreateManualProgramRequest(config));
            if (!response.IsSuccessStatusCode || response.Content is null)
            {
                return response.ToErrorResult();
            }

            var channels = await ChannelsByPathAsync();
            return Ok(Item(response.Content, channels.GetValueOrDefault(response.Content.Config.ChannelPath), null));
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status502BadGateway);
        }
    }

    /// <summary>
    /// Cancels a manual recording and its upcoming slots. What it already recorded stays on
    /// the Recordings page.
    /// </summary>
    [HttpDelete("{programId:int}")]
    public async Task<IActionResult> Delete(int programId)
    {
        var client = await deviceResolver.ResolveAsync();
        if (client is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        try
        {
            // Only ever DELETE something the device confirms is a manual recording.
            var existing = await client.GetManualProgramAsync(programId);
            if (!existing.IsSuccessStatusCode || existing.Content is null)
            {
                return existing.ToErrorResult();
            }

            var response = await client.DeleteManualProgramAsync(programId);
            return response.IsSuccessStatusCode ? NoContent() : response.ToErrorResult();
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status502BadGateway);
        }
    }

    private static Dictionary<string, string[]>? Validate(CreateRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            errors[nameof(request.Title)] = ["Enter a title."];
        }

        if (request.ChannelId <= 0)
        {
            errors[nameof(request.ChannelId)] = ["Choose a channel."];
        }

        if (request.Hour is < 0 or > 23 || request.Minute is < 0 or > 59)
        {
            errors[nameof(request.Hour)] = ["Enter a valid start time."];
        }

        if (request.DurationMinutes is < 1 or > MaxDurationMinutes)
        {
            errors[nameof(request.DurationMinutes)] = [$"Enter a duration from 1 to {MaxDurationMinutes} minutes."];
        }

        if (!TimeZoneInfo.TryFindSystemTimeZoneById(request.Timezone, out var timeZone))
        {
            errors[nameof(request.Timezone)] = ["Unknown time zone."];
        }

        if (request.Repeating)
        {
            if (request.Days is not { Length: > 0 } || request.Days.Any(d => !DayNames.Contains(d)))
            {
                errors[nameof(request.Days)] = ["Choose at least one day."];
            }
        }
        else if (request.Date is not { } date)
        {
            errors[nameof(request.Date)] = ["Choose a date."];
        }
        else if (timeZone is not null && request.Hour is >= 0 and <= 23 && request.Minute is >= 0 and <= 59)
        {
            var local = date.ToDateTime(new TimeOnly(request.Hour, request.Minute));
            if (TimeZoneInfo.ConvertTimeToUtc(local, timeZone) <= DateTime.UtcNow)
            {
                errors[nameof(request.Date)] = ["Choose a time that hasn't passed yet."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    // The device's channels (see IDeviceChannels) by path, e.g. "/guide/channels/76404" -
    // empty if they can't be read, which just leaves recordings without channel details.
    private async Task<Dictionary<string, GuideChannel>> ChannelsByPathAsync() =>
        (await deviceChannels.GetAsync())?.ToDictionary(c => c.Path) ?? [];

    private static async Task<Dictionary<string, T>?> BatchAsync<T>(ITabloDeviceClient client, string[] paths)
        where T : class
    {
        if (paths.Length == 0)
        {
            return new Dictionary<string, T>();
        }

        var response = await client.PostBatchAsync<T>(paths);
        return response is { IsSuccessStatusCode: true, Content: not null } ? new Dictionary<string, T>(response.Content) : null;
    }

    private static object Item(ManualProgram program, GuideChannel? channel, Airing? nextAiring) => new
    {
        id = program.ObjectId,
        path = program.Path,
        title = program.Config.Title,
        channel = channel is null ? null : UpcomingResponses.Channel(channel),
        repeating = program.Config.Kind == "recurring",
        once = program.Config.Once,
        recurring = program.Config.Recurring,
        // Minutes, as the Add dialog takes it.
        durationMinutes = program.Config.Duration / 60,
        nextAiring = nextAiring is null ? null : new
        {
            datetime = nextAiring.AiringDetails.Datetime,
            schedule = UpcomingResponses.Schedule(nextAiring.Schedule),
        },
    };
}
