"""Explainable, review-only merchant candidate generation."""

import re
from collections import defaultdict
from difflib import SequenceMatcher
from unicodedata import normalize

MAX_REVIEW_PAIRS = 24
MAX_BLOCK_NEIGHBORS = 16


def pair_key(left, right):
    return tuple(sorted((left.strip().upper(), right.strip().upper())))


def normalized_name(descriptor):
    return "".join(char for char in normalize("NFKC", descriptor) if char.isalnum())


def validate_dismissals(value, descriptors):
    if not isinstance(value, list) or len(value) > 100:
        raise ValueError("Use at most 100 dismissed merchant pairs.")
    result = {}
    for pair in value:
        if not isinstance(pair, list) or len(pair) != 2 or not all(isinstance(item, str) for item in pair):
            raise ValueError("Each dismissal must identify two statement descriptors.")
        key = pair_key(*pair)
        if key[0] == key[1] or any(item not in descriptors for item in key):
            raise ValueError("Dismiss two distinct debit descriptors from the current statement.")
        result[key] = pair
    return list(result.values())


def merchant_suggestions(descriptors, confirmed, dismissed, known_aliases):
    names = {key: normalized_name(key) for key in descriptors}
    dismissed_keys = {pair_key(*pair) for pair in dismissed}
    canonical = set(confirmed.values())
    known_targets = set(known_aliases.values())
    blocks = defaultdict(list)
    aliases = defaultdict(list)
    for key, name in names.items():
        if key in confirmed:
            continue
        if len(name) >= 4:
            blocks[name[:4], tuple(re.findall(r"\d+", normalize("NFKC", key)))].append(key)
        resolved = known_aliases.get(key, key if key in known_targets else None)
        if resolved:
            aliases[resolved].append(key)

    candidates = {}

    def add(left, right, priority, reason, similarity=None):
        key = pair_key(left, right)
        if key in dismissed_keys or (left in canonical and right in canonical):
            return
        if key in candidates and candidates[key][0] <= priority:
            return
        if left in canonical or (right not in canonical and left < right):
            left, right = right, left
        candidates[key] = priority, {
            "source": descriptors[left], "target": descriptors[right],
            "reason": reason, **({"similarity": similarity} if similarity is not None else {}),
        }

    for bucket in aliases.values():
        bucket.sort()
        for index, left in enumerate(bucket):
            for right in bucket[index + 1:index + 1 + MAX_BLOCK_NEIGHBORS]:
                add(left, right, 0, "Both descriptions appear under the same configured merchant alias")

    for bucket in blocks.values():
        bucket.sort(key=lambda key: (names[key], key))
        for index, left in enumerate(bucket):
            for right in bucket[index + 1:index + 1 + MAX_BLOCK_NEIGHBORS]:
                first, second = names[left], names[right]
                if first == second:
                    add(left, right, 1, "Same letters and digits after ignoring punctuation and spacing")
                elif 8 <= min(len(first), len(second)) and max(len(first), len(second)) <= 64 and abs(len(first) - len(second)) <= 2:
                    comparison = SequenceMatcher(None, first, second, autojunk=False)
                    if comparison.quick_ratio() < 0.9:
                        continue
                    score = comparison.ratio()
                    if score >= 0.9:
                        add(left, right, 2, "Similar spelling and identical numeric tokens", round(score, 3))

    ranked = sorted(candidates.values(), key=lambda item: (item[0], -item[1].get("similarity", 1), item[1]["target"], item[1]["source"]))
    return [suggestion for _, suggestion in ranked[:MAX_REVIEW_PAIRS]]
