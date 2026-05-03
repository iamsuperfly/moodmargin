# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


class MoodMarginRiskCouncil(gl.Contract):
    reviews: TreeMap[str, str]
    review_keys: DynArray[str]

    def __init__(self):
        pass

    def _make_key(self, token_address: str, chain_name: str) -> str:
        return chain_name.strip().lower() + ":" + token_address.strip().lower()

    @gl.public.write.payable
    def submit_review(
        self,
        token_address: str,
        chain_name: str,
        token_symbol: str,
        review_timestamp: int,
        risk_score: int,
        top_holder_bps: int,
        top_10_bps: int,
        ownership_status: str,
        liquidity_status: str,
        deployer_risk_note: str,
        recommendation: str,
        explanation: str,
    ) -> bool:
        key = self._make_key(token_address, chain_name)

        if key in self.reviews:
            return False

        adjusted_risk = risk_score

        if top_holder_bps > 2000:
            adjusted_risk = max(adjusted_risk, 80)

        if top_10_bps > 6000:
            adjusted_risk = max(adjusted_risk, 85)

        if liquidity_status != "locked":
            adjusted_risk = max(adjusted_risk, 75)

        if ownership_status != "renounced":
            adjusted_risk = max(adjusted_risk, 70)

        if adjusted_risk >= 80:
            recommendation = "AVOID"
        elif adjusted_risk >= 60:
            recommendation = "RESTRICT"
        else:
            recommendation = "WATCH"

        risk_score = adjusted_risk

        final_explanation = ""

        if top_holder_bps > 2000:
            final_explanation += "High top holder concentration. "

        if top_10_bps > 6000:
            final_explanation += "Top 10 wallets control large supply. "

        if liquidity_status != "locked":
            final_explanation += "Liquidity is not locked. "

        if ownership_status != "renounced":
            final_explanation += "Contract ownership not renounced. "

        if final_explanation == "":
            final_explanation = "Token structure appears relatively safe."

        record = (
            token_address.strip().lower()
            + "|"
            + chain_name.strip().lower()
            + "|"
            + token_symbol.strip().upper()
            + "|"
            + str(review_timestamp)
            + "|"
            + str(risk_score)
            + "|"
            + str(top_holder_bps)
            + "|"
            + str(top_10_bps)
            + "|"
            + ownership_status
            + "|"
            + liquidity_status
            + "|"
            + deployer_risk_note
            + "|"
            + recommendation
            + "|"
            + final_explanation
        )

        self.reviews[key] = record
        self.review_keys.append(key)

        return True

    @gl.public.write
    def update_review(
        self,
        token_address: str,
        chain_name: str,
        token_symbol: str,
        review_timestamp: int,
        risk_score: int,
        top_holder_bps: int,
        top_10_bps: int,
        ownership_status: str,
        liquidity_status: str,
        deployer_risk_note: str,
        recommendation: str,
        explanation: str,
    ) -> bool:
        key = self._make_key(token_address, chain_name)

        if key not in self.reviews:
            return False

        adjusted_risk = risk_score

        if top_holder_bps > 2000:
            adjusted_risk = max(adjusted_risk, 80)

        if top_10_bps > 6000:
            adjusted_risk = max(adjusted_risk, 85)

        if liquidity_status != "locked":
            adjusted_risk = max(adjusted_risk, 75)

        if ownership_status != "renounced":
            adjusted_risk = max(adjusted_risk, 70)

        if adjusted_risk >= 80:
            recommendation = "AVOID"
        elif adjusted_risk >= 60:
            recommendation = "RESTRICT"
        else:
            recommendation = "WATCH"

        risk_score = adjusted_risk

        final_explanation = ""

        if top_holder_bps > 2000:
            final_explanation += "High top holder concentration. "

        if top_10_bps > 6000:
            final_explanation += "Top 10 wallets control large supply. "

        if liquidity_status != "locked":
            final_explanation += "Liquidity is not locked. "

        if ownership_status != "renounced":
            final_explanation += "Contract ownership not renounced. "

        if final_explanation == "":
            final_explanation = "Token structure appears relatively safe."

        record = (
            token_address.strip().lower()
            + "|"
            + chain_name.strip().lower()
            + "|"
            + token_symbol.strip().upper()
            + "|"
            + str(review_timestamp)
            + "|"
            + str(risk_score)
            + "|"
            + str(top_holder_bps)
            + "|"
            + str(top_10_bps)
            + "|"
            + ownership_status
            + "|"
            + liquidity_status
            + "|"
            + deployer_risk_note
            + "|"
            + recommendation
            + "|"
            + final_explanation
        )

        self.reviews[key] = record

        return True

    @gl.public.view
    def get_review(self, token_address: str, chain_name: str) -> str:
        key = self._make_key(token_address, chain_name)
        return self.reviews.get(key, "")

    @gl.public.view
    def get_review_count(self) -> int:
        return len(self.review_keys)

    @gl.public.view
    def get_review_key_at(self, index: int) -> str:
        if index < 0 or index >= len(self.review_keys):
            return ""
        return self.review_keys[index]

    @gl.public.view
    def get_all_reviews(self):
        result = []
        for key in self.review_keys:
            result.append(self.reviews[key])
        return result