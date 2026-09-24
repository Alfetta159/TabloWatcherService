using System.Globalization;
using System.Text.Json.Serialization;

namespace TabloWatcherService.Api.Services.Tablo;

/// <summary>
/// The association server returns timestamps like "2026-09-20 03:07:25.664585+00:00"
/// (space instead of "T"), which System.Text.Json's default DateTime converter rejects.
/// </summary>
public class TabloDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        DateTime.Parse(reader.GetString()!, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToString("O", CultureInfo.InvariantCulture));
}
