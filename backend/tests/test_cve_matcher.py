"""
Tests de la lógica pura del matcher de CVEs.

Cubre:
- _clean_version
- _version_key / _cmp_version
- _version_in_range
- _extract_vulnerable_ranges
- _cve_applies_to_version
- _dedup_cves
- _build_cpe
- _normalize_cpe_list
- _extract_vendor_product
- _parse_nvd_response
- _filter_by_version

NO toca NVD (httpx) ni Redis. Solo funciones puras.
"""

from __future__ import annotations

import pytest

from app.services import cve_matcher as m


# ==========================================================
# _clean_version
# ==========================================================
class TestCleanVersion:
    def test_simple_version(self):
        assert m._clean_version("9.9") == "9.9"

    def test_version_with_patch(self):
        assert m._clean_version("8.2p1") == "8.2"

    def test_version_with_distro_suffix(self):
        assert m._clean_version("9.6 Ubuntu 22.04") == "9.6"

    def test_version_with_parens(self):
        assert m._clean_version("OpenSSH 9.6 (Ubuntu)") == "9.6"

    def test_version_empty(self):
        assert m._clean_version("") == ""

    def test_version_no_digits(self):
        # Sin dígitos → devuelve el string limpio tal cual
        assert m._clean_version("foo") == "foo"


# ==========================================================
# _version_key / _cmp_version
# ==========================================================
class TestVersionKey:
    def test_simple(self):
        assert m._version_key("9.9") == (9, 9)

    def test_three_segments(self):
        assert m._version_key("2.4.49") == (2, 4, 49)

    def test_letter_suffix(self):
        assert m._version_key("8.2p1") == (8, 2, "p", 1)

    def test_empty(self):
        assert m._version_key("") == tuple()


class TestCmpVersion:
    def test_equal(self):
        assert m._cmp_version((9, 9), (9, 9)) == 0

    def test_major_diff(self):
        assert m._cmp_version((9, 9), (10, 0)) == -1

    def test_minor_diff(self):
        assert m._cmp_version((9, 10), (9, 9)) == 1

    def test_missing_segment_is_less(self):
        assert m._cmp_version((9,), (9, 1)) == -1

    def test_mixed_types(self):
        # (8, 2, "p", 1) vs (8, 2, 1) → "p" vs 1 → str("p") > str("1")
        assert m._cmp_version((8, 2, "p", 1), (8, 2, 1)) == 1


# ==========================================================
# _version_in_range
# ==========================================================
class TestVersionInRange:
    def test_start_including_match(self):
        assert m._version_in_range("9.5", start_including="9.0") is True

    def test_start_including_boundary(self):
        assert m._version_in_range("9.0", start_including="9.0") is True

    def test_start_including_below(self):
        assert m._version_in_range("8.9", start_including="9.0") is False

    def test_end_excluding_boundary(self):
        assert m._version_in_range("9.8", end_excluding="9.8") is False

    def test_end_excluding_below(self):
        assert m._version_in_range("9.7", end_excluding="9.8") is True

    def test_end_including_boundary(self):
        assert m._version_in_range("9.8", end_including="9.8") is True

    def test_full_range(self):
        assert m._version_in_range(
            "9.5",
            start_including="9.0",
            end_excluding="9.8",
        ) is True

    def test_version_empty(self):
        assert m._version_in_range("") is False


# ==========================================================
# _extract_vulnerable_ranges
# ==========================================================
class TestExtractVulnerableRanges:
    def test_matches_vendor_product(self):
        configs = [
            {
                "nodes": [
                    {
                        "cpeMatch": [
                            {
                                "vulnerable": True,
                                "criteria": "cpe:2.3:a:openbsd:openssh:*:*:*:*:*:*:*:*",
                                "versionStartIncluding": "9.0",
                                "versionEndExcluding": "9.8",
                            }
                        ]
                    }
                ]
            }
        ]
        ranges = m._extract_vulnerable_ranges(configs, "openbsd", "openssh")
        assert len(ranges) == 1
        assert ranges[0]["start_including"] == "9.0"
        assert ranges[0]["end_excluding"] == "9.8"

    def test_skips_non_vulnerable(self):
        configs = [
            {
                "nodes": [
                    {
                        "cpeMatch": [
                            {
                                "vulnerable": False,
                                "criteria": "cpe:2.3:a:openbsd:openssh:*:*:*:*:*:*:*:*",
                            }
                        ]
                    }
                ]
            }
        ]
        ranges = m._extract_vulnerable_ranges(configs, "openbsd", "openssh")
        assert ranges == []

    def test_no_match_wrong_product(self):
        configs = [
            {
                "nodes": [
                    {
                        "cpeMatch": [
                            {
                                "vulnerable": True,
                                "criteria": "cpe:2.3:a:nginx:nginx:*:*:*:*:*:*:*:*",
                            }
                        ]
                    }
                ]
            }
        ]
        ranges = m._extract_vulnerable_ranges(configs, "openbsd", "openssh")
        assert ranges == []

    def test_empty_configs(self):
        assert m._extract_vulnerable_ranges([], "openbsd", "openssh") == []


# ==========================================================
# _cve_applies_to_version
# ==========================================================
class TestCveAppliesToVersion:
    def test_no_configurations_returns_true(self):
        cve = {"id": "CVE-X", "_configurations": []}
        assert m._cve_applies_to_version(cve, "9.5", "openbsd", "openssh") is True

    def test_version_in_range(self):
        cve = {
            "id": "CVE-X",
            "_configurations": [
                {
                    "nodes": [
                        {
                            "cpeMatch": [
                                {
                                    "vulnerable": True,
                                    "criteria": "cpe:2.3:a:openbsd:openssh:*:*:*:*:*:*:*:*",
                                    "versionStartIncluding": "9.0",
                                    "versionEndExcluding": "9.8",
                                }
                            ]
                        }
                    ]
                }
            ],
        }
        assert m._cve_applies_to_version(cve, "9.5", "openbsd", "openssh") is True

    def test_version_out_of_range(self):
        cve = {
            "id": "CVE-X",
            "_configurations": [
                {
                    "nodes": [
                        {
                            "cpeMatch": [
                                {
                                    "vulnerable": True,
                                    "criteria": "cpe:2.3:a:openbsd:openssh:*:*:*:*:*:*:*:*",
                                    "versionStartIncluding": "9.0",
                                    "versionEndExcluding": "9.8",
                                }
                            ]
                        }
                    ]
                }
            ],
        }
        assert m._cve_applies_to_version(cve, "9.9", "openbsd", "openssh") is False

    def test_empty_version_returns_true(self):
        cve = {"id": "CVE-X", "_configurations": []}
        assert m._cve_applies_to_version(cve, "", "openbsd", "openssh") is True


# ==========================================================
# _dedup_cves
# ==========================================================
class TestDedupCves:
    def test_duplicates_keep_highest_severity(self):
        cves = [
            {"id": "CVE-1", "severity": "low"},
            {"id": "CVE-1", "severity": "critical"},
            {"id": "CVE-2", "severity": "medium"},
        ]
        out = m._dedup_cves(cves)
        by_id = {c["id"]: c for c in out}
        assert len(out) == 2
        assert by_id["CVE-1"]["severity"] == "critical"
        assert by_id["CVE-2"]["severity"] == "medium"

    def test_skips_without_id(self):
        cves = [
            {"severity": "high"},
            {"id": "CVE-1", "severity": "high"},
        ]
        out = m._dedup_cves(cves)
        assert len(out) == 1

    def test_empty(self):
        assert m._dedup_cves([]) == []


# ==========================================================
# _build_cpe
# ==========================================================
class TestBuildCpe:
    def test_known_service(self):
        cpe = m._build_cpe("ssh", "9.6")
        assert cpe is not None
        assert cpe.startswith("cpe:2.3:a:openbsd:openssh:9.6")

    def test_unknown_service(self):
        assert m._build_cpe("unknown-svc", "1.0") is None

    def test_empty_service(self):
        assert m._build_cpe("", "1.0") is None

    def test_empty_version_uses_wildcard(self):
        cpe = m._build_cpe("ssh", "")
        assert cpe is not None
        assert ":*:" in cpe


# ==========================================================
# _normalize_cpe_list
# ==========================================================
class TestNormalizeCpeList:
    def test_filters_non_cpe(self):
        out = m._normalize_cpe_list(
            [
                "cpe:2.3:a:openbsd:openssh:9.6:*:*:*:*:*:*:*",
                "not-a-cpe",
                "",
                "  cpe:2.3:a:nginx:nginx:1.24:*:*:*:*:*:*:*  ",
            ]
        )
        assert len(out) == 2

    def test_empty(self):
        assert m._normalize_cpe_list([]) == []


# ==========================================================
# _extract_vendor_product
# ==========================================================
class TestExtractVendorProduct:
    def test_from_cpe(self):
        v, p = m._extract_vendor_product(
            ["cpe:2.3:a:openbsd:openssh:9.6:*:*:*:*:*:*:*"],
            "ssh",
        )
        assert (v, p) == ("openbsd", "openssh")

    def test_from_service_map(self):
        v, p = m._extract_vendor_product([], "ssh")
        assert (v, p) == ("openbsd", "openssh")

    def test_unknown_service_fallback(self):
        v, p = m._extract_vendor_product([], "totally-unknown")
        assert (v, p) == ("*", "*")


# ==========================================================
# _parse_nvd_response
# ==========================================================
class TestParseNvdResponse:
    def test_parses_single_cve(self, sample_nvd_response):
        out = m._parse_nvd_response(sample_nvd_response)
        assert len(out) == 1
        cve = out[0]
        assert cve["id"] == "CVE-2024-12345"
        assert cve["severity"] == "critical"
        assert cve["cvss"] == 9.8
        assert "OpenSSH" in cve["description"]
        assert "_configurations" in cve

    def test_empty_response(self, sample_nvd_empty):
        assert m._parse_nvd_response(sample_nvd_empty) == []

    def test_no_metrics_returns_unknown(self):
        payload = {
            "vulnerabilities": [
                {
                    "cve": {
                        "id": "CVE-XXXX-1",
                        "descriptions": [{"lang": "en", "value": "no metrics"}],
                    }
                }
            ]
        }
        out = m._parse_nvd_response(payload)
        assert out[0]["severity"] == "unknown"
        assert out[0]["cvss"] is None

    def test_truncates_long_description(self):
        long_desc = "x" * 1000
        payload = {
            "vulnerabilities": [
                {
                    "cve": {
                        "id": "CVE-XXXX-2",
                        "descriptions": [{"lang": "en", "value": long_desc}],
                    }
                }
            ]
        }
        out = m._parse_nvd_response(payload)
        assert out[0]["description"] is not None
        assert len(out[0]["description"]) <= 500


# ==========================================================
# _filter_by_version
# ==========================================================
class TestFilterByVersion:
    def test_drops_configurations_from_output(self, sample_nvd_response):
        cves = m._parse_nvd_response(sample_nvd_response)
        out = m._filter_by_version(cves, "9.5", "openbsd", "openssh")
        assert len(out) == 1
        assert "_configurations" not in out[0]

    def test_removes_non_applicable(self, sample_nvd_response):
        cves = m._parse_nvd_response(sample_nvd_response)
        # 9.9 está fuera del rango [9.0, 9.8)
        out = m._filter_by_version(cves, "9.9", "openbsd", "openssh")
        assert out == []

    def test_empty_version_keeps_all(self, sample_nvd_response):
        cves = m._parse_nvd_response(sample_nvd_response)
        out = m._filter_by_version(cves, "", "openbsd", "openssh")
        assert len(out) == 1
        assert "_configurations" not in out[0]
