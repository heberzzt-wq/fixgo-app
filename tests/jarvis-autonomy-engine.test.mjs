import assert from "node:assert/strict";
import { test } from "node:test";

import {
    describeAutonomyLearning,
    recallAutonomyLessons,
    recordAutonomyEvent,
    resetAutonomyLearning,
    snapshotAutonomyLearning
} from "../gestia-core/jarvis/jarvis.autonomy.engine.js";

test("autonomy learns empty write failures and recalls the lesson", () => {
    resetAutonomyLearning();

    const learned =
        recordAutonomyEvent({
            status: "blocked",
            stage: "repo_write",
            operation: "CODE_WRITE",
            file: "test-runtime.js",
            reason: "EMPTY_WRITE_CONTENT",
            scan: {
                file: "test-runtime.js",
                risk: "CRITICAL",
                flags: ["EMPTY_SOURCE"],
                findings: [
                    {
                        id: "EMPTY_SOURCE"
                    }
                ]
            }
        });

    assert.equal(learned.ok, true);
    assert.equal(learned.learned, true);
    assert.equal(learned.lesson.diagnosis, "empty_write_content");

    const recalled =
        recallAutonomyLessons({
            stage: "repo_write",
            operation: "CODE_WRITE",
            file: "test-runtime.js",
            reason: "EMPTY_WRITE_CONTENT",
            scan: {
                flags: ["EMPTY_SOURCE"],
                findings: [
                    {
                        id: "EMPTY_SOURCE"
                    }
                ]
            }
        });

    assert.equal(recalled.total, 1);
    assert.equal(recalled.lessons[0].lesson.diagnosis, "empty_write_content");
    assert.match(recalled.lessons[0].lesson.nextAction, /Regenerar contenido/i);
});

test("autonomy treats safe zone blocks as legacy advisory learning", () => {
    resetAutonomyLearning();

    recordAutonomyEvent({
        status: "blocked",
        stage: "generatePatch",
        operation: "PATCH",
        file: "gestia-terminal.js",
        reason: "DENY_PATCH_UNSAFE_ZONE"
    });

    const recalled =
        recallAutonomyLessons({
            stage: "generatePatch",
            operation: "PATCH",
            file: "gestia-terminal.js",
            reason: "DENY_PATCH_UNSAFE_ZONE"
        });

    assert.equal(recalled.total, 1);
    assert.equal(recalled.lessons[0].lesson.diagnosis, "legacy_safe_zone_block");
    assert.match(recalled.lessons[0].lesson.nextAction, /preferencia/i);
});

test("autonomy keeps bounded memory snapshots", () => {
    resetAutonomyLearning();

    for (let index = 0; index < 130; index += 1) {
        recordAutonomyEvent({
            status: "failed",
            stage: "test",
            operation: "loop",
            file: `file-${index}.js`,
            reason: `REASON_${index}`
        });
    }

    const snapshot =
        snapshotAutonomyLearning();

    assert.equal(snapshot.events.length, 120);
    assert.ok(Object.keys(snapshot.patterns).length <= 80);
});

test("autonomy learns agent loop incidents as technical proposal guidance", () => {
    resetAutonomyLearning();

    const invalidPreview =
        recordAutonomyEvent({
            type:
                "LEARNING_INCIDENT",
            category:
                "PATCH_PREVIEW_VALIDATION",
            status:
                "blocked",
            stage:
                "terminal_patch_preview_follow_up",
            operation:
                "PATCH_PREVIEW_DRY_RUN",
            file:
                "app-tecnico-b2b.js",
            reason:
                "INVALID_TAILWIND_DECIMAL_CLASS",
            symptom:
                "Jarvis, aplica en preview el ajuste anterior.",
            wrongBehavior:
                "Generated py-1.5.5 in a replace candidate.",
            fixRule:
                "Regenerate replace before preview when Tailwind classes are invalid.",
            relatedCommit:
                "41.35",
            sourceTraceId:
                "trace-test"
        });

    assert.equal(invalidPreview.ok, true);
    assert.equal(invalidPreview.learned, true);
    assert.equal(invalidPreview.lesson.diagnosis, "patch_preview_validation_failed");

    recordAutonomyEvent({
        type:
            "LEARNING_INCIDENT",
        category:
            "FOLLOW_UP_MEMORY",
        status:
            "success",
        stage:
            "terminal_patch_preview_follow_up",
        operation:
            "PATCH_PREVIEW_DRY_RUN",
        file:
            "app-tecnico-b2b.js",
        reason:
            "LAST_PATCH_PREVIEW_CANDIDATE_REUSED",
        fixRule:
            "Reuse the stored candidate for natural dry-run follow-ups."
    });

    const recalled =
        recallAutonomyLessons({
            type:
                "LEARNING_INCIDENT",
            category:
                "PATCH_PREVIEW_VALIDATION",
            stage:
                "terminal_patch_preview_follow_up",
            operation:
                "PATCH_PREVIEW_DRY_RUN",
            file:
                "app-tecnico-b2b.js",
            reason:
                "INVALID_TAILWIND_DECIMAL_CLASS"
        });

    assert.ok(recalled.total >= 1);

    const validationLesson =
        recalled.lessons.find(item =>
            item.category === "patch_preview_validation"
        );

    assert.ok(validationLesson);
    assert.equal(validationLesson.fixRule, "Regenerate replace before preview when Tailwind classes are invalid.");
    assert.equal(validationLesson.relatedCommit, "41.35");
    assert.match(validationLesson.lesson.avoid, /Tailwind/i);
});

test("autonomy exposes V2 learning contract", () => {
    const description =
        describeAutonomyLearning();

    assert.equal(description.ok, true);
    assert.equal(description.version, "2.0.0-failure-learning");
    assert.equal(description.storageKey, "jarvis_autonomy_learning_v2");
    assert.ok(description.legacyStorageKeys.includes("jarvis_autonomy_learning_v1"));
    assert.ok(description.capabilities.includes("failure_pattern_learning"));
    assert.ok(description.capabilities.includes("agent_loop_learning_hints"));
    assert.ok(description.capabilities.includes("patch_preview_safety_learning"));
});
