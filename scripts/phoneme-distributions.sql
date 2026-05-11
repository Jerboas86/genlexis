-- Phoneme distribution table for the phoneme-balanced word list generator.
-- Stores per-language target phoneme distributions (probabilities, sum ≈ 1).
--
-- Seed: French phoneme frequencies from Wioland (normalized & reduced).
-- Canonicalization: R rewritten as ʁ; ã (0.0029761904761904) merged into
-- ɑ̃ (0.0049603174603174) → 0.0079365079365078.

CREATE TABLE IF NOT EXISTS aud.language_phoneme_distributions (
    language aud.lang_code NOT NULL,
    phoneme text NOT NULL,
    frequency numeric NOT NULL,
    CONSTRAINT language_phoneme_distributions_pk
        PRIMARY KEY (language, phoneme),
    CONSTRAINT language_phoneme_distributions_frequency_range
        CHECK (frequency >= 0 AND frequency <= 1)
);

INSERT INTO aud.language_phoneme_distributions (language, phoneme, frequency) VALUES
    ('fr-FR', 'ʁ',  0.0773809523809523),
    ('fr-FR', 'a',  0.0753968253968253),
    ('fr-FR', 'l',  0.0615079365079365),
    ('fr-FR', 's',  0.0575396825396825),
    ('fr-FR', 'e',  0.0555555555555555),
    ('fr-FR', 'ə',  0.0535714285714285),
    ('fr-FR', 't',  0.0525793650793650),
    ('fr-FR', 'i',  0.0525793650793650),
    ('fr-FR', 'd',  0.0426587301587301),
    ('fr-FR', 'p',  0.0396825396825396),
    ('fr-FR', 'k',  0.0396825396825396),
    ('fr-FR', 'm',  0.0357142857142857),
    ('fr-FR', 'ɔ̃',  0.0337301587301587),
    ('fr-FR', 'u',  0.0337301587301587),
    ('fr-FR', 'n',  0.0297619047619047),
    ('fr-FR', 'v',  0.0267857142857142),
    ('fr-FR', 'ɔ',  0.0248015873015873),
    ('fr-FR', 'y',  0.0228174603174603),
    ('fr-FR', 'o',  0.0208333333333333),
    ('fr-FR', 'ɛ',  0.0188492063492063),
    ('fr-FR', 'j',  0.0178571428571428),
    ('fr-FR', 'ʒ',  0.0148809523809523),
    ('fr-FR', 'z',  0.0148809523809523),
    ('fr-FR', 'f',  0.0138888888888888),
    ('fr-FR', 'œ',  0.0128968253968253),
    ('fr-FR', 'ø',  0.0119047619047619),
    ('fr-FR', 'b',  0.0109126984126984),
    ('fr-FR', 'w',  0.0099206349206349),
    ('fr-FR', 'ɑ̃',  0.0079365079365078),
    ('fr-FR', 'ʃ',  0.0059523809523809),
    ('fr-FR', 'g',  0.0059523809523809),
    ('fr-FR', 'œ̃',  0.0059523809523809),
    ('fr-FR', 'ɛ̃',  0.0049603174603174),
    ('fr-FR', 'ɥ',  0.0039682539682539),
    ('fr-FR', 'ŋ',  0.0029761904761904)
ON CONFLICT (language, phoneme) DO UPDATE
    SET frequency = EXCLUDED.frequency;
