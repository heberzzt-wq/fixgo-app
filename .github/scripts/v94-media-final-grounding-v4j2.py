from pathlib import Path
import subprocess

subprocess.run(
    ["python3", ".github/scripts/v94-media-final-grounding-v4j.py"],
    check=True
)

media_path = Path("functions/jarvis-media-analysis.js")
media = media_path.read_text(encoding="utf-8")

old_filter = '''                    .filter(item =>
                        !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                            String(item || "")
                        )
                    ),'''
new_filter = '''                    .filter(item => {
                        const value = String(item || "");
                        const verifiedValues = verifiedVisibleLiteralValues([source]);
                        return (
                            !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(value) &&
                            !containsUnverifiedSensitiveNarrativeLiteral(
                                value,
                                verifiedValues
                            )
                        );
                    }),'''
if old_filter not in media:
    raise SystemExit("v4j2 observation filter anchor missing")
media = media.replace(old_filter, new_filter, 1)

old_return = '''    return sanitizePrecisionNarrative(strictParsed).parsed;
}'''
new_return = '''    return strictParsed;
}'''
if old_return not in media:
    raise SystemExit("v4j2 strict return anchor missing")
media = media.replace(old_return, new_return, 1)

media_path.write_text(media, encoding="utf-8")
