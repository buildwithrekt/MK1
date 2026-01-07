//exemple d'appel pour recuperer les data d'un memecoin
const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    'x-chain': 'solana',
    'X-API-KEY': '05a7a1bcf7004d37b7db49dd0fdd0e43'
  }
};

fetch('https://public-api.birdeye.so/defi/v3/token/meme/detail/single?address=76sDhJ7X2ycUzjMXBPup7maNqUsvkNLUgWyi1W7Zpump', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));

  // return
  {
  "data": {
    "address": "76sDhJ7X2ycUzjMXBPup7maNqUsvkNLUgWyi1W7Zpump",
    "name": "Just Ass",
    "symbol": "JUSTASS",
    "decimals": 6,
    "extensions": {
      "description": "",
      "twitter": "https://x.com/i/communities/2009029466631418196"
    },
    "logo_uri": "https://ipfs.io/ipfs/bafkreigvwrrixjo4ly2x76ylfgnjntx7qd42svaqsbsbdaugizpkmvd354",
    "price": 0.000007174820255187761,
    "liquidity": 9441.622292324399,
    "total_supply": 1000000000,
    "circulating_supply": 1000000000,
    "fdv": 7174.820255187761,
    "market_cap": 7174.820255187761,
    "meme_info": {
      "source": "pump_dot_fun",
      "platform_id": "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      "created_at": {
        "slot": 392004270,
        "tx_hash": "5YopJ1RnDoXWm4TCyiZpwMznFPWUvEH4THjdyenRWtszpFzhCT6qxhRFV451gLAWXmkLLVkBQphjesKbHA6VqFwr",
        "block_time": 1767825043
      },
      "creation_time": 1767825043,
      "creator": "BGB6o7BAxU6bPw9aXEFcCGh3Eom8btqupPGKAyN4R32x",
      "graduated": false,
      "graduated_time": null,
      "pool": {
        "address": "7gzH4pe3HGKuPS6LT88KUwkoka1DbbTj8QCvsA8kBccg",
        "real_sol_reserves": "11071014929",
        "real_token_reserves": "503864416610992",
        "token_total_supply": "1000000000000000",
        "virtual_token_reserves": "783764416610992"
      },
      "progress_percent": 36.46899,
      "address": "76sDhJ7X2ycUzjMXBPup7maNqUsvkNLUgWyi1W7Zpump"
    }
  },
  "success": true
}