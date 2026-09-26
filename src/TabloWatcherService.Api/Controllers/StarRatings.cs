namespace TabloWatcherService.Api.Controllers;

internal static class StarRatings
{
    // The Tablo's quality_rating runs 4-10: Gracenote's 1-4 star critic rating in half-star
    // steps, doubled and offset by 2 (4 = one star, 10 = four). Not documented anywhere -
    // inferred from real guide data, where the 10s are classics like The Searchers and the 4s
    // are the likes of Werewolves on Wheels.
    public static double? FromQualityRating(int? qualityRating) =>
        qualityRating is >= 4 and <= 10 ? (qualityRating.Value - 2) / 2.0 : null;
}
