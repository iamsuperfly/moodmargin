// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MoodMarginStableCoin (MMUSD)
 * @notice Demo ERC-20 token for the MoodMargin perpetual trading platform.
 *         Deployed on Arbitrum Sepolia.
 *         Fixed supply of 1,000,000,000 MMUSD minted entirely to deployer.
 * @dev    No mint/burn after deploy. Ownership is fully renounced at construction.
 */
contract MMUSD {
    string public constant name = "Mood Margin Stable Coin";
    string public constant symbol = "MMUSD";
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 1_000_000_000 * 10 ** 18;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        _balances[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address owner, address spender) public view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        uint256 cur = _allowances[from][msg.sender];
        require(cur >= amount, "MMUSD: insufficient allowance");
        unchecked { _allowances[from][msg.sender] = cur - amount; }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "MMUSD: transfer from zero");
        require(to != address(0), "MMUSD: transfer to zero");
        require(_balances[from] >= amount, "MMUSD: insufficient balance");
        unchecked { _balances[from] -= amount; }
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0));
        require(spender != address(0));
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
