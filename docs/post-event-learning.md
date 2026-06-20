# Post-Event Learning Framework

This framework defines a future feedback contract only. It does not add a database, API, or persistence behavior.

## Record lifecycle

1. At plan approval, retain the event features, model version, `predicted_tis`, and `predicted_resources`.
2. After operations close, an authorized operator records `actual_tis`, `actual_resources`, and structured feedback.
3. Validate each record against `data/schemas/post_event_learning.schema.json`.
4. Store validated records in a future audited operational store. The current repository intentionally does not implement this step.
5. On a scheduled retraining cycle, join feedback records to immutable event features by `event_id` and `model_version`.

## Future retraining flow

```text
Event features + approved prediction
              |
              v
Post-event actuals and operator feedback
              |
              v
Schema validation and quality checks
              |
              v
Temporal train/validation split
              |
              v
Congestion model + resource calibration models
              |
              v
Offline evaluation, bias review, and operator acceptance
              |
              v
Versioned deployment with rollback
```

The first learned target should be measured `actual_tis`, not the current deterministic TIS surrogate. Resource models should learn residuals between predicted and actual deployment, while `accepted_plan` and `diversion_effective` should be evaluation and ranking signals rather than direct congestion labels.

## Required safeguards

- Preserve the prediction and model version that existed before outcomes were known.
- Use temporal validation to avoid training on future events.
- Reject incomplete or contradictory feedback instead of silently imputing operational outcomes.
- Track error by event cause, zone, scale, closure status, and attendance band.
- Require human review before promoting a new model or resource policy.
- Retain operator notes for audit, but exclude free text from training until privacy and quality controls exist.
