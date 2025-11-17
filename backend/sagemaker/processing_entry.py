#!/usr/bin/env python3
"""Entry point for SageMaker Processing Jobs running TotalSegmentator."""

import json
import os
import sys
import traceback

import inference


def main():
    payload_str = os.environ.get('JOB_PAYLOAD')
    if not payload_str:
        print('[processing_entry] JOB_PAYLOAD environment variable missing', flush=True)
        return 1

    try:
        input_data = json.loads(payload_str)
    except json.JSONDecodeError:
        print('[processing_entry] Failed to parse JOB_PAYLOAD as JSON', flush=True)
        return 1

    try:
        model_dir = os.environ.get('SM_MODEL_DIR', '/opt/ml/model')
        model = inference.model_fn(model_dir)
        result = inference.predict_fn(input_data, model)
        print('[processing_entry] Processing completed successfully', flush=True)
        print(json.dumps(result), flush=True)
        return 0
    except Exception as exc:  # pragma: no cover - entrypoint
        print(f'[processing_entry] Error: {exc}', flush=True)
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
