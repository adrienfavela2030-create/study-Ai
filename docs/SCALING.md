# Scaling Guide

The `tiny_lm` config proves the pipeline on CPU. To scale: more licensed data, larger n_embd/n_layer, more training steps, GPU. Re-train tokenizer on the full corpus. Never claim proficiency until held-out tests support it.
