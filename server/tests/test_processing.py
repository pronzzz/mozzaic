import numpy as np
import pytest

from server.processing import (
    bayer_matrix,
    bgr_to_hex,
    downsample_image,
    hex_to_bgr,
    kmeans_palette,
    parse_palette,
    pixelate,
    quantize_image_kmeans,
    quantize_indices,
)


def test_downsample_keeps_aspect_and_never_upscales():
    img = np.zeros((100, 200, 3), np.uint8)
    assert downsample_image(img, 50).shape == (25, 50, 3)
    assert downsample_image(img, 500).shape == (100, 200, 3)


def test_hex_round_trip_is_bgr():
    assert hex_to_bgr("#ff8000") == (0, 128, 255)
    assert bgr_to_hex((0, 128, 255)) == "#ff8000"
    with pytest.raises(ValueError):
        hex_to_bgr("nope")


def test_parse_palette_presets_and_lists():
    assert parse_palette(None) is None
    assert parse_palette("  ") is None
    gb = parse_palette("game-boy")
    assert gb.shape == (4, 3)
    custom = parse_palette("000000, ffffff,#ff0000")
    assert custom.tolist() == [[0, 0, 0], [255, 255, 255], [0, 0, 255]]
    with pytest.raises(ValueError):
        parse_palette("ffffff")  # one colour
    with pytest.raises(ValueError):
        parse_palette("zzzzzz,000000")


def test_kmeans_palette_size_and_order():
    img = np.random.default_rng(1).integers(0, 255, (40, 40, 3), dtype=np.uint8)
    pal = kmeans_palette(img, 6)
    assert 1 <= len(pal) <= 6
    assert pal.dtype == np.uint8


def test_kmeans_palette_with_few_unique_colours():
    img = np.zeros((10, 10, 3), np.uint8)
    img[:5] = (255, 255, 255)
    pal = kmeans_palette(img, 8)
    assert sorted(map(tuple, pal.tolist())) == [(0, 0, 0), (255, 255, 255)]


def test_quantize_image_kmeans_colour_count():
    img = np.random.default_rng(2).integers(0, 255, (20, 20, 3), dtype=np.uint8)
    out = quantize_image_kmeans(img, 4)
    assert out.shape == img.shape and out.dtype == np.uint8
    assert len(np.unique(out.reshape(-1, 3), axis=0)) <= 4


@pytest.mark.parametrize("dither", ["none", "bayer4", "floyd"])
def test_quantize_only_uses_palette(dither):
    pal = parse_palette("pico-8")
    img = np.random.default_rng(3).integers(0, 255, (24, 32, 3), dtype=np.uint8)
    idx = quantize_indices(img, pal, dither)
    assert idx.shape == (24, 32)
    assert idx.min() >= 0 and idx.max() < len(pal)


def test_floyd_preserves_mean_grey():
    pal = parse_palette("one-bit")
    img = np.full((48, 48, 3), 128, np.uint8)
    share = (quantize_indices(img, pal, "floyd") == 1).mean()
    assert 0.4 < share < 0.6


def test_bayer_matrix_is_a_permutation():
    m = bayer_matrix(4)
    assert m.shape == (4, 4)
    assert sorted((m * 16 - 0.5).round().astype(int).ravel().tolist()) == list(range(16))
    assert m[0, :] * 16 - 0.5 == pytest.approx([0, 8, 2, 10])


def test_pixelate_keeps_alpha_and_scales():
    img = np.zeros((40, 80, 4), np.uint8)
    img[..., :3] = 200
    img[:, :40, 3] = 255  # left half opaque
    out, pal = pixelate(img, width=20, palette=parse_palette("one-bit"), scale=3)
    assert out.shape == (30, 60, 4)
    assert (out[:, :27, 3] == 255).all() and (out[:, 33:, 3] == 0).all()
    assert len(pal) == 2


def test_floyd_error_stays_bounded_with_unreachable_colours():
    pal = parse_palette("game-boy")
    img = np.zeros((48, 48, 3), np.uint8)
    img[:] = (44, 28, 26)  # navy (BGR): the palette has no blue at all
    share = (quantize_indices(img, pal, "floyd") == 0).mean()
    assert share > 0.9
