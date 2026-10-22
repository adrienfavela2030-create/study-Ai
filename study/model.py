"""Decoder-only Transformer implemented with plain tensor operations.

This module contains a complete, small, pure-NumPy Transformer with a
hand-derived backward pass. It exists so the from-scratch training
pipeline can be verified end to end (forward, backward, gradcheck,
optimization, checkpointing) on any machine with NumPy.

The larger PyTorch equivalent lives in torch_model.py for scale-up
training. Neither uses pretrained weights: every parameter is randomly
initialized.
"""

from __future__ import annotations

import json
import math

import numpy as np


class TransformerConfig:
    def __init__(
        self,
        vocab_size: int,
        d_model: int = 24,
        n_heads: int = 3,
        n_layers: int = 1,
        context_length: int = 64,
        mlp_ratio: int = 4,
    ):
        self.vocab_size = vocab_size
        self.d_model = d_model
        self.n_heads = n_heads
        self.n_layers = n_layers
        self.context_length = context_length
        self.mlp_ratio = mlp_ratio
        if d_model % n_heads != 0:
            raise ValueError("d_model must be divisible by n_heads")

    def to_dict(self) -> dict:
        return vars(self)

    @classmethod
    def from_dict(cls, d: dict) -> "TransformerConfig":
        return cls(**d)

    def param_count(self) -> int:
        d, V, T, r = self.d_model, self.vocab_size, self.context_length, self.mlp_ratio
        per_layer = (
            3 * d * d + 3 * d + d * d + d
            + 2 * d * d * r + d * r + d
            + 4 * d
        )
        return self.n_layers * per_layer + V * d + T * d + 2 * d + d * V


class TinyNumPyTransformer:
    """Decoder-only Transformer: embeddings -> blocks -> LN -> LM head.

    Forward and backward passes are implemented by hand in NumPy, so
    training does not rely on an autodiff framework or pretrained model.
    """

    def __init__(self, cfg: TransformerConfig, seed: int = 0):
        self.cfg = cfg
        self.rng = np.random.default_rng(seed)
        d, V, T, r = cfg.d_model, cfg.vocab_size, cfg.context_length, cfg.mlp_ratio

        def normal(*shape, scale=1.0):
            return self.rng.normal(0.0, scale, size=shape)

        p: dict[str, np.ndarray] = {}
        p["tok_emb"] = normal(V, d, scale=0.08)
        p["pos_emb"] = normal(T, d, scale=0.02)
        for l in range(cfg.n_layers):
            s = 1.0 / math.sqrt(d)
            p[f"Wq_{l}"] = normal(d, d, scale=s)
            p[f"bq_{l}"] = np.zeros(d)
            p[f"Wk_{l}"] = normal(d, d, scale=s)
            p[f"bk_{l}"] = np.zeros(d)
            p[f"Wv_{l}"] = normal(d, d, scale=s)
            p[f"bv_{l}"] = np.zeros(d)
            p[f"Wo_{l}"] = normal(d, d, scale=s)
            p[f"bo_{l}"] = np.zeros(d)
            p[f"W1_{l}"] = normal(d, r * d, scale=1.0 / math.sqrt(d))
            p[f"b1_{l}"] = np.zeros(r * d)
            p[f"W2_{l}"] = normal(r * d, d, scale=1.0 / math.sqrt(r * d))
            p[f"b2_{l}"] = np.zeros(d)
            p[f"ln1_gamma_{l}"] = np.ones(d)
            p[f"ln1_beta_{l}"] = np.zeros(d)
            p[f"ln2_gamma_{l}"] = np.ones(d)
            p[f"ln2_beta_{l}"] = np.zeros(d)
        p["lnf_gamma"] = np.ones(d)
        p["lnf_beta"] = np.zeros(d)
        p["lm_head"] = normal(d, V, scale=1.0 / math.sqrt(d))
        self.params = p

    # ------------------------------------------------------------------
    @staticmethod
    def _ln_forward(x, gamma, beta):
        mu = x.mean(-1, keepdims=True)
        var = x.var(-1, keepdims=True)
        xhat = (x - mu) / np.sqrt(var + 1e-5)
        return xhat * gamma + beta, xhat, x

    @staticmethod
    def _ln_backward(dout, x, xhat, gamma):
        """Backward through y = ((x-mu)/sigma) * gamma + beta.

        Correct for arbitrary (non-unit) gamma: the per-channel scaling
        must be applied BEFORE the mean terms.
        """
        dgamma = (dout * xhat).sum(axis=tuple(range(dout.ndim - 1)))
        dbeta = dout.sum(axis=tuple(range(dout.ndim - 1)))
        sigma = np.sqrt(x.var(-1, keepdims=True) + 1e-5)
        g = dout * gamma
        m1 = g.mean(-1, keepdims=True)
        m2 = (g * xhat).mean(-1, keepdims=True)
        dx = (g - m1 - xhat * m2) / sigma
        return dx, dgamma, dbeta

    @staticmethod
    def _softmax(x):
        m = x.max(-1, keepdims=True)
        e = np.exp(x - m)
        return e / e.sum(-1, keepdims=True)

    # ------------------------------------------------------------------
    def forward(self, ids: np.ndarray, cache: dict | None = None):
        p = self.params
        cfg = self.cfg
        B, T = ids.shape
        d, h, hd = cfg.d_model, cfg.n_heads, cfg.d_model // cfg.n_heads

        x = p["tok_emb"][ids] + p["pos_emb"][:T][None]
        if cache is not None:
            cache["ids"] = ids

        for l in range(cfg.n_layers):
            a, xhat1, x_ln1_in = self._ln_forward(x, p[f"ln1_gamma_{l}"], p[f"ln1_beta_{l}"])
            q = a @ p[f"Wq_{l}"] + p[f"bq_{l}"]
            k = a @ p[f"Wk_{l}"] + p[f"bk_{l}"]
            v = a @ p[f"Wv_{l}"] + p[f"bv_{l}"]
            q_ = q.reshape(B, T, h, hd).transpose(0, 2, 1, 3)
            k_ = k.reshape(B, T, h, hd).transpose(0, 2, 1, 3)
            v_ = v.reshape(B, T, h, hd).transpose(0, 2, 1, 3)
            scores = q_ @ k_.transpose(0, 1, 3, 2) / math.sqrt(hd)
            causal = np.triu(np.ones((T, T), dtype=bool), 1)
            scores = np.where(causal[None, None], -1e9, scores)
            att = self._softmax(scores)
            yconcat = (att @ v_).transpose(0, 2, 1, 3).reshape(B, T, d)
            y = yconcat @ p[f"Wo_{l}"] + p[f"bo_{l}"]
            x2 = x + y
            m, xhat2, x2_pre = self._ln_forward(x2, p[f"ln2_gamma_{l}"], p[f"ln2_beta_{l}"])
            f1 = m @ p[f"W1_{l}"] + p[f"b1_{l}"]
            f1r = np.maximum(f1, 0)
            f2 = f1r @ p[f"W2_{l}"] + p[f"b2_{l}"]
            x = x2 + f2
            if cache is not None:
                cache[f"l{l}"] = dict(
                    x_in=x - y - f2,  # x before this block's updates
                    a=a, xhat1=xhat1, x_ln1_in=x_ln1_in, q=q, k=k, v=v, att=att,
                    yconcat=yconcat, x2_pre=x2_pre, x2=x2, m=m, xhat2=xhat2,
                    f1=f1, f1r=f1r, f2=f2,
                )

        xf, xhatf, x_final_in = self._ln_forward(x, p["lnf_gamma"], p["lnf_beta"])
        logits = xf @ p["lm_head"]
        if cache is not None:
            cache["xhatf"] = xhatf
            cache["xf"] = xf
            cache["x_final_in"] = x_final_in
            cache["logits"] = logits
        return logits

    # ------------------------------------------------------------------
    def loss_and_logits(self, ids: np.ndarray, targets: np.ndarray, cache: dict | None = None):
        """Next-token loss.

        Convention: `targets[b, t]` is the token that follows
        `ids[b, t]` in the original text (callers pre-shift), so
        logits at position t are scored against targets at position t
        directly — no additional shifting happens here. A previous
        version shifted targets a second time and trained the model to
        predict two tokens ahead; that defect is now covered by tests.
        """
        logits = self.forward(ids, cache)
        B, T, V = logits.shape
        sh = logits.reshape(-1, V)
        tgt = targets.reshape(-1)
        probs = self._softmax(sh)
        loss = float(-np.log(probs[np.arange(len(tgt)), tgt] + 1e-12).mean())
        return loss, logits

    # ------------------------------------------------------------------
    def backward(self, cache: dict, targets: np.ndarray) -> dict[str, np.ndarray]:
        cfg = self.cfg
        p = self.params
        logits = cache["logits"]
        B, T, V = logits.shape
        d, h, hd = cfg.d_model, cfg.n_heads, cfg.d_model // cfg.n_heads
        n = B * T

        grads = {k: np.zeros_like(v) for k, v in p.items()}

        # Cross-entropy + softmax backward (average over all positions).
        dlogits = np.exp(logits - logits.max(-1, keepdims=True))
        dlogits /= dlogits.sum(-1, keepdims=True)
        dlogits = dlogits.reshape(-1, V)
        tgt = targets.reshape(-1)
        dlogits[np.arange(n), tgt] -= 1.0
        dlogits /= n
        dlogits = dlogits.reshape(B, T, V)

        xf = cache["xf"]
        grads["lm_head"] = xf.reshape(-1, d).T @ dlogits.reshape(-1, V)
        dxf = dlogits @ p["lm_head"].T
        dx, dg, db = self._ln_backward(dxf, cache["x_final_in"], cache["xhatf"], p["lnf_gamma"])
        grads["lnf_gamma"] += dg
        grads["lnf_beta"] += db

        causal = np.triu(np.ones((T, T), dtype=bool), 1)

        for l in reversed(range(cfg.n_layers)):
            c = cache[f"l{l}"]
            B_, T_ = B, T

            # ---- MLP block: x_out = x2 + f2 ----
            df2 = dx.copy()
            grads[f"W2_{l}"] += c["f1r"].reshape(-1, cfg.mlp_ratio * d).T @ df2.reshape(-1, d)
            grads[f"b2_{l}"] += df2.reshape(-1, d).sum(0)
            df1r = df2 @ p[f"W2_{l}"].T
            df1 = df1r * (c["f1"] > 0)
            dm = df1 @ p[f"W1_{l}"].T
            grads[f"W1_{l}"] += c["m"].reshape(-1, d).T @ df1.reshape(-1, cfg.mlp_ratio * d)
            grads[f"b1_{l}"] += df1.reshape(-1, cfg.mlp_ratio * d).sum(0)
            dx2_ln, dg2, db2 = self._ln_backward(dm, c["x2_pre"], c["xhat2"], p[f"ln2_gamma_{l}"])
            grads[f"ln2_gamma_{l}"] += dg2
            grads[f"ln2_beta_{l}"] += db2
            dx2 = df2 + dx2_ln  # both residual paths into x2

            # ---- Attention block: x2 = x_in + y ----
            dy = dx2
            grads[f"Wo_{l}"] += c["yconcat"].reshape(-1, d).T @ dy.reshape(-1, d)
            grads[f"bo_{l}"] += dy.reshape(-1, d).sum(0)
            dyconcat = dy @ p[f"Wo_{l}"].T
            dyheads = dyconcat.reshape(B, T, h, hd).transpose(0, 2, 1, 3)

            v_ = c["v"].reshape(B, T, h, hd).transpose(0, 2, 1, 3)
            k_ = c["k"].reshape(B, T, h, hd).transpose(0, 2, 1, 3)
            q_ = c["q"].reshape(B, T, h, hd).transpose(0, 2, 1, 3)

            datt = dyheads @ v_.transpose(0, 1, 3, 2)
            dv_ = c["att"].transpose(0, 1, 3, 2) @ dyheads
            # softmax backward: dz = att * datt - att * sum_j(att_j * datt_j)
            dscores = datt * c["att"]
            dscores = dscores - c["att"] * (datt * c["att"]).sum(-1, keepdims=True)
            dscores = np.where(causal[None, None], 0.0, dscores)
            dscores = dscores / math.sqrt(hd)
            dq_ = dscores @ k_
            dk_ = dscores.transpose(0, 1, 3, 2) @ q_

            dq = dq_.transpose(0, 2, 1, 3).reshape(B, T, d)
            dk = dk_.transpose(0, 2, 1, 3).reshape(B, T, d)
            dv = dv_.transpose(0, 2, 1, 3).reshape(B, T, d)

            a_flat = c["a"].reshape(-1, d)
            grads[f"Wq_{l}"] += a_flat.T @ dq.reshape(-1, d)
            grads[f"bq_{l}"] += dq.reshape(-1, d).sum(0)
            grads[f"Wk_{l}"] += a_flat.T @ dk.reshape(-1, d)
            grads[f"bk_{l}"] += dk.reshape(-1, d).sum(0)
            grads[f"Wv_{l}"] += a_flat.T @ dv.reshape(-1, d)
            grads[f"bv_{l}"] += dv.reshape(-1, d).sum(0)

            da = dq @ p[f"Wq_{l}"].T + dk @ p[f"Wk_{l}"].T + dv @ p[f"Wv_{l}"].T
            dx_ln, dg1, db1 = self._ln_backward(da, c["x_ln1_in"], c["xhat1"], p[f"ln1_gamma_{l}"])
            grads[f"ln1_gamma_{l}"] += dg1
            grads[f"ln1_beta_{l}"] += db1
            dx = dx2 + dx_ln  # residual path + layernorm path

        # ---- embeddings ----
        np.add.at(grads["tok_emb"], cache["ids"], dx)
        grads["pos_emb"][:T] += dx.sum(axis=0)
        return grads

    # ------------------------------------------------------------------
    def gradcheck(self, ids: np.ndarray, targets: np.ndarray, eps: float = 1e-6, samples_per_tensor: int = 3, randomize_gamma: bool = True) -> dict:
        """Finite-difference check of the analytical backward pass.

        With `randomize_gamma=True`, layernorm scales are set to random
        non-unit values first. A previous version checked only the
        initial state where every gamma equals 1, which hid an
        incorrect layer-norm gradient that only appears after training
        begins to move gamma.
        """
        if randomize_gamma:
            rng0 = np.random.default_rng(99)
            for name, arr in self.params.items():
                if "gamma" in name:
                    arr[:] = rng0.uniform(0.2, 3.0, size=arr.shape)
        cache: dict = {}
        self.loss_and_logits(ids, targets, cache)
        analytic = self.backward(cache, targets)
        rng = np.random.default_rng(1)
        report: dict[str, float] = {}
        # Combined absolute+relative acceptance test per sampled entry:
        #   |num - ana| <= atol + rtol * max(|num|, |ana|)
        # Each entry is recorded as the violation RATIO
        #   |num - ana| / (atol + rtol * max(|num|, |ana|))
        # so ratio <= 1 means the entry passes; the per-tensor worst ratio
        # and the overall pass/fail share ONE consistent scale. This is a
        # SAMPLED check (samples_per_tensor random entries per tensor),
        # not exhaustive.
        atol, rtol = 1e-6, 1e-3
        n_entries = 0
        for name, arr in self.params.items():
            worst = 0.0
            for _ in range(samples_per_tensor):
                if arr.size == 0:
                    continue
                idx = tuple(rng.integers(0, s) for s in arr.shape)
                old = arr[idx]
                arr[idx] = old + eps
                lp, _ = self.loss_and_logits(ids, targets)
                arr[idx] = old - eps
                lm, _ = self.loss_and_logits(ids, targets)
                arr[idx] = old
                num = (lp - lm) / (2 * eps)
                ana = analytic[name][idx]
                n_entries += 1
                ratio = abs(num - ana) / (atol + rtol * max(abs(num), abs(ana)))
                worst = max(worst, ratio)
            report[name] = worst
        report["_n_entries"] = n_entries
        report["_atol"] = atol
        report["_rtol"] = rtol
        return report


# ----------------------------------------------------------------------
# Adam optimizer
# ----------------------------------------------------------------------
class Adam:
    def __init__(self, params: dict[str, np.ndarray], lr: float = 0.01):
        self.lr = lr
        self.m = {k: np.zeros_like(v) for k, v in params.items()}
        self.v = {k: np.zeros_like(v) for k, v in params.items()}
        self.t = 0

    def state_dict(self) -> dict:
        """Optimizer state for checkpointing (Adam moments + step count)."""
        return {"lr": self.lr, "t": self.t,
                "m": {k: v.tolist() for k, v in self.m.items()},
                "v": {k: v.tolist() for k, v in self.v.items()}}

    def load_state_dict(self, state: dict) -> None:
        self.lr = state["lr"]
        self.t = state["t"]
        self.m = {k: np.array(v) for k, v in state["m"].items()}
        self.v = {k: np.array(v) for k, v in state["v"].items()}

    def step(self, params: dict[str, np.ndarray], grads: dict[str, np.ndarray]):
        self.t += 1
        for k, g in grads.items():
            self.m[k] = 0.9 * self.m[k] + 0.1 * g
            self.v[k] = 0.999 * self.v[k] + 0.001 * g * g
            mhat = self.m[k] / (1 - 0.9 ** self.t)
            vhat = self.v[k] / (1 - 0.999 ** self.t)
            params[k] -= self.lr * mhat / (np.sqrt(vhat) + 1e-8)


# ----------------------------------------------------------------------
# Checkpointing
# ----------------------------------------------------------------------
def save_checkpoint(path: str, model: TinyNumPyTransformer, meta: dict,
                    optimizer: "Adam | None" = None) -> None:
    payload = {
        "config": model.cfg.to_dict(),
        "params": {k: v.tolist() for k, v in model.params.items()},
        "meta": meta,
    }
    if optimizer is not None:
        # optimizer state (Adam moments + step count) so training can be
        # resumed reproducibly, not just re-fit from the parameters
        payload["optimizer"] = optimizer.state_dict()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f)


def load_checkpoint(path: str) -> tuple[TinyNumPyTransformer, dict]:
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    cfg = TransformerConfig.from_dict(payload["config"])
    model = TinyNumPyTransformer(cfg, seed=0)
    model.params = {k: np.array(v) for k, v in payload["params"].items()}
    meta = payload["meta"]
    # Vocabulary compatibility: if the checkpoint carries its tokenizer
    # vocabulary, a mismatch with the model's embedding size is an error,
    # never a silent remap (which would change what every token means).
    saved_vocab = meta.get("tokenizer_vocab")
    if saved_vocab is not None:
        if len(saved_vocab) != cfg.vocab_size:
            raise ValueError(
                f"checkpoint vocab size {len(saved_vocab)} does not match model "
                f"vocab size {cfg.vocab_size} — retrain or use the matching tokenizer"
            )
        if model.params["tok_emb"].shape[0] != len(saved_vocab):
            raise ValueError("checkpoint embedding table does not match saved vocab")
    return model, meta, payload.get("optimizer")
