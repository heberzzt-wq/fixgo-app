"use strict";

function cleanProviderText(value = "", maximum = 1000) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maximum);
}

function normalizedRaiReasons(value) {
    return (Array.isArray(value) ? value : [])
        .map(reason => cleanProviderText(reason, 500))
        .filter((reason, index, reasons) => Boolean(reason) && reasons.indexOf(reason) === index)
        .slice(0, 20);
}

function failedResult(status, providerCode, providerMessage, extras = {}) {
    return {
        ok: false,
        status,
        providerCode,
        providerMessage,
        retryable: false,
        fullRestartAllowed: false,
        ...extras
    };
}

function classifyCompletedVideoOperation(operation = {}) {
    if (operation?.done !== true) {
        return {
            ok: false,
            status: "VIDEO_GENERATION_OPERATION_NOT_DONE",
            providerCode: "OPERATION_NOT_DONE",
            providerMessage: "The video generation operation is still pending.",
            retryable: true,
            fullRestartAllowed: false
        };
    }

    const response = operation?.response;
    const raiMediaFilteredReasons = normalizedRaiReasons(
        response?.raiMediaFilteredReasons
    );
    const raiMediaFilteredCount = Number(response?.raiMediaFilteredCount || 0);
    if (raiMediaFilteredReasons.length > 0 || raiMediaFilteredCount > 0) {
        return failedResult(
            "VIDEO_GENERATION_RAI_FILTERED",
            "RAI_MEDIA_FILTERED",
            "The provider filtered the generated media.",
            {
                raiMediaFilteredCount: Number.isFinite(raiMediaFilteredCount)
                    ? raiMediaFilteredCount
                    : raiMediaFilteredReasons.length,
                raiMediaFilteredReasons
            }
        );
    }

    if (operation?.error) {
        return failedResult(
            "VIDEO_GENERATION_OPERATION_FAILED",
            cleanProviderText(
                operation.error?.code || operation.error?.status || operation.error?.name,
                160
            ) || "OPERATION_FAILED",
            cleanProviderText(operation.error?.message || operation.error, 1000) ||
                "The provider video operation failed."
        );
    }

    if (!response || typeof response !== "object" || Array.isArray(response)) {
        return failedResult(
            "VIDEO_GENERATION_PROVIDER_RESPONSE_INVALID",
            "PROVIDER_RESPONSE_INVALID",
            "The provider completed the operation without a valid response object."
        );
    }

    if (!Array.isArray(response.generatedVideos)) {
        return failedResult(
            "VIDEO_GENERATION_PROVIDER_RESPONSE_INVALID",
            "PROVIDER_RESPONSE_INVALID",
            "The provider response did not contain a generatedVideos array."
        );
    }

    if (response.generatedVideos.length === 0) {
        return failedResult(
            "VIDEO_GENERATION_RESULT_MISSING",
            "GENERATED_VIDEO_MISSING",
            "The provider completed the operation without a generated video."
        );
    }

    const video = response.generatedVideos[0]?.video;
    const videoUri = cleanProviderText(video?.uri || video?.videoUri, 2400);
    if (!video || typeof video !== "object" || Array.isArray(video) || !videoUri) {
        return failedResult(
            "VIDEO_GENERATION_PROVIDER_RESPONSE_INVALID",
            "PROVIDER_RESPONSE_INVALID",
            "The generated video entry did not contain a valid video URI."
        );
    }

    return {
        ok: true,
        status: "VIDEO_GENERATION_RESULT_READY",
        retryable: false,
        video
    };
}

module.exports = {
    classifyCompletedVideoOperation,
    normalizedRaiReasons
};
