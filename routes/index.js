/**
 * Copyright (C) 2015 whphhg
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version. For more information read the
 * complete license in LICENSE.md.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Express framework
 */
var express = require('express');
var router = express.Router();

/**
 * Start a new socket.io server listening on 20123
 */
var http = require('http');
var https = require('https');
var server = http.createServer(module.exports.app = express());
var io = require('socket.io').listen(server.listen(20123));

/**
 * Set port and host for RPC client
 */
var rpc = require('node-json-rpc');
var client = new rpc.Client({port: 9195, host: '127.0.0.1', path: '/', strict: true});

/**
 * Use nconf to load and update config.json
 */
var nconf = require('nconf').use('file', {file: './config.json'});
    nconf.load();

/**
 * Array deep copying module (https://github.com/dreamerslab/node.extend)
 */
var extend = require('node.extend');

/**
 * Request module
 */
var request = require('request');

/**
 * Run when a client connects
 */
io.on('connection', function(socket) {
    /**
     * Variables object
     */
    var vars = {
        "watch_addresses":extend(true, [], nconf.get('watchaddresses')),
        "local_currency":nconf.get('settings:localcurrency'),
        "btc_local":0,
        "vnl_poloniex":0,
        "vnl_bittrex":0,
        "vnl_average":0,
        "incentive_percentages":[{"block_height":246900, "percentage":13},
                                 {"block_height":252000, "percentage":14},
                                 {"block_height":257600, "percentage":15},
                                 {"block_height":263600, "percentage":16},
                                 {"block_height":270000, "percentage":17},
                                 {"block_height":276900, "percentage":18},
                                 {"block_height":284200, "percentage":19},
                                 {"block_height":292000, "percentage":20},
                                 {"block_height":300200, "percentage":21},
                                 {"block_height":308900, "percentage":22},
                                 {"block_height":318000, "percentage":23},
                                 {"block_height":327500, "percentage":24},
                                 {"block_height":337500, "percentage":25},
                                 {"block_height":347900, "percentage":26},
                                 {"block_height":358800, "percentage":27},
                                 {"block_height":370100, "percentage":28},
                                 {"block_height":381900, "percentage":29},
                                 {"block_height":394100, "percentage":30},
                                 {"block_height":406800, "percentage":31},
                                 {"block_height":419900, "percentage":32},
                                 {"block_height":433400, "percentage":33},
                                 {"block_height":447400, "percentage":34},
                                 {"block_height":461800, "percentage":35},
                                 {"block_height":476700, "percentage":36},
                                 {"block_height":492000, "percentage":37}],
        "currencies":[]
    }

    /**
     * Emit incentive percentages
     */
    socket.emit('incentive_percentages', vars['incentive_percentages']);

    /**
     * Create and emit QR code
     */
    socket.on('qr_code_create', function(obj) {
        var qr = require('qrcode-npm').qrcode(4, 'M');
            qr.addData(obj);
            qr.make();

        socket.emit('qr_code_return', qr.createImgTag(4));
    });

    /**
     * Refresh watch address list
     */
    socket.on('refresh_watch_addresses', function() {
        HTTPS_getwatchaddresses();
    });

    /**
     * Save new local currency to config.json & update
     */
    socket.on('set_local_currency', function(currency) {
        nconf.set('settings:localcurrency', currency);
        nconf.save(function(err) {
            if (err) {
                console.error(err.message);
                return;
            }

            /**
             * Update local currencies accros the page
             */
            vars['local_currency'] = currency;
            update_prices(currency);
            RPC_listreceivedbyaddress();
            RPC_listsinceblock();
            socket.emit('watchaddresses', vars['watch_addresses']);
        });
    });

    /**
     * Encrypt wallet
     */
    socket.on('encryptwallet', function(encryptionkey) {
        client.call({"jsonrpc": "2.0", "method": "encryptwallet", "params": [encryptionkey], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            if (res['result']) {
                socket.emit('alerts', 'Wallet encrypted successfuly. Restart the process.');
            }
        });
    });

    /**
     * Unlock wallet
     */
    socket.on('walletpassphrase', function(walletpassphrase) {
        client.call({"jsonrpc": "2.0", "method": "walletpassphrase", "params": [walletpassphrase], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            /**
             * Update the locking / unlocking form
             */
            if (res.hasOwnProperty('result')) {
                RPC_walletpassphrase();
            }

            if (res.hasOwnProperty('error')) {
                socket.emit('alerts', "The passphrase you've entered is incorrect.");                
            }
        });
    });

    /**
     * Lock wallet
     */
    socket.on('walletlock', function(obj) {
        client.call({"jsonrpc": "2.0", "method": "walletlock", "params": [], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            /**
             * Update the locking / unlocking form
             */
            RPC_walletpassphrase();
        });
    });

    /**
     * Generate a new wallet address
     */
    socket.on('getnewaddress', function(obj) {
        client.call({"jsonrpc": "2.0", "method": "getnewaddress", "params": [], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            /**
             * Update wallet address list
             */
            RPC_listreceivedbyaddress();
        });
    });

    /**
     * Sweep private key
     */
    socket.on('importprivkey', function(privatekey) {
        client.call({"jsonrpc": "2.0", "method": "importprivkey", "params": [privatekey], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            if (res.error) {
                if (res.error['code'] == -5) {
                    socket.emit('alerts', "The private key you've entered is invalid.");
                } else if (res.error['code'] == -4) {
                    socket.emit('alerts', "The private key you've entered is already in your wallet or your wallet is locked.");
                }
            } else {
                socket.emit('alerts', "Private key added successfully.");

                /**
                 * Update wallet address list
                 */
                RPC_listreceivedbyaddress();
            }
        });
    });

    /**
     * Add new watch address object to config.json
     */
    socket.on('addwatchaddress', function(array) {
        var address = array[0];
        var title = array[1];

        client.call({"jsonrpc": "2.0", "method": "validateaddress", "params": [address], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            var already_added = false;
            var configaddresses = nconf.get('watchaddresses');

            /**
             * Check if the address is already saved
             */
            for (var key in configaddresses) {
                if (configaddresses[key]['address'] == address) {
                    already_added = true;
                    break;
                }
            }

            if (res.result['isvalid'] && !res.result['ismine'] && !already_added) {
                configaddresses.push({"address":address, "title":title});

                nconf.set('watchaddresses', configaddresses);
                nconf.save(function(err) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                });

                /**
                 * Add new watch address object to watchaddresses array
                 */
                vars['watch_addresses'].push({"address":address, "title":title});

                /**
                 * Update watch address list
                 */
                HTTPS_getwatchaddresses();
            } else if (res.result['ismine']) {
                socket.emit('alerts', "The watch only address you've entered is already in your wallet.");
            } else if (already_added) {
                socket.emit('alerts', "The watch only address you've entered is already on the list.");
            } else {
                socket.emit('alerts', "The watch only address you've entered is not a valid address.");
            }
        });
    });

    /**
     * Check if the address is valid before transfering coins
     */
    socket.on('validateaddress', function(params) {
        var address = params[0];
        var amount = params[1];

        client.call({"jsonrpc": "2.0", "method": "validateaddress", "params": [address], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            if (res.result['isvalid']) {
                socket.emit('transfer_possible', [address, amount]);
            } else {
                socket.emit('alerts', "The address you're trying to send to is not valid.");
            }
        });
    });

    /**
     * Send amount to address
     */
    socket.on('sendtoaddress', function(params) {
        var address = params[0];
        var amount = params[1];

        client.call({"jsonrpc": "2.0", "method": "sendtoaddress", "params": [address, amount], "id": 0}, function(err, res) {
            if (err) { console.log(err); }

            if (res.error) {
                /**
                 * error_code_type_error = -3, NaN or negative
                 */
                if (res.error['code'] == -3) {
                    socket.emit('alerts', "You're trying to send an invalid amount (" + amount + ").");
                }
                /**
                 * error_code_wallet_error = -4, not enough funds
                 */
                else if (res.error['code'] == -4) {
                    socket.emit('alerts', "You have insufficient funds.");
                }
                /**
                 * error_code_wallet_unlock_needed = -13, wallet locked
                 */
                else if (res.error['code'] == -13) {
                    socket.emit('alerts', 'Wallet is locked. Unlock it if you want to transfer funds.');
                }
                /**
                 * error_code_amount_too_small = -101, amount too small
                 */
                else if (res.error['code'] == -101) {
                    socket.emit('alerts', 'Amount too small.');
                } else {
                    console.log(res.error);
                }
            } else {
                socket.emit('alerts', "Sent " + amount + " VNL to " + address + " (txid: " + res.result + ").");

                /**
                 * Update recent transaction list
                 */
                RPC_listsinceblock();
            }
        }); 
    });

    /**
     * Calculate and emit incentive reward % based on supplied block number
     */
    socket.on('calculate_percentage', function(block_number) {
        for (var key in vars['incentive_percentages']) {
            if (block_number < parseInt(vars['incentive_percentages'][key]['block_height'])) {
                socket.emit('return_percentage', parseInt(vars['incentive_percentages'][key]['percentage']) - 1);
                break;
            }

            if (parseInt(key) == vars['incentive_percentages'].length - 1) {
                socket.emit('return_percentage', parseInt(vars['incentive_percentages'][key]['percentage']));
            }
        }
    });

    /**
     * RPC method 'backupwallet'
     */
    socket.on('backupwallet', function() {
        client.call({"jsonrpc": "2.0", "method": "backupwallet", "params": [""], "id": 0}, function(err, res) {
            if (err) { console.log(err); }
            socket.emit('backupwallet_done', true);
        });
    });

    /**
     * RPC method 'checkwallet'
     */
    socket.on('checkwallet', function() {
        client.call({"jsonrpc": "2.0", "method": "checkwallet", "params": [], "id": 0}, function(err, res) {
            if (err) { console.log(err); }
            socket.emit('checkwallet_done', res.result);
        });
    });

    /**
     * RPC method 'repairwallet'
     */
    socket.on('repairwallet', function() {
        client.call({"jsonrpc": "2.0", "method": "repairwallet", "params": [], "id": 0}, function(err, res) {
            if (err) { console.log(err); }
            socket.emit('repairwallet_done', res.result);
        });
    });

    /**
     * Update prices across the page with supplied local currency
     */
    function update_prices(currency) {
        if (vars['vnl_poloniex'] != 0 && vars['vnl_bittrex'] != 0) {
            vars['vnl_average'] = (vars['vnl_poloniex'] + vars['vnl_bittrex']) / 2;
        } else {
            vars['vnl_average'] = vars['vnl_poloniex'] + vars['vnl_bittrex'];
        }

        for (var key in vars['currencies']) {
            if (vars['currencies'][key]['name'] == currency) {
                vars['btc_local'] = vars['currencies'][key]['btc'];
                break;
            }
        }

        socket.emit('local_currency', [vars['local_currency'], vars['btc_local'], vars['vnl_average']]);
    }

    /**
     * JSON API for foreign exchange rates. Get current foreign exchange rates published by the European Central Bank. Updated daily
     */
    function HTTPS_fixerio() {
        request('https://api.fixer.io/latest?base=USD', function(error, response, body) {
            if (!error) {
                fixerio = JSON.parse(body);
                fixerio = fixerio.rates;

                for (var key in fixerio) {
                    if (fixerio.hasOwnProperty(key)) {
                        /**
                         * Insert into currencies array
                         */
                        vars['currencies'].push({'name':key, 'one_usd_buys':fixerio[key]});
                    }
                }

                /**
                 * Because base is USD set USD to 1
                 */
                vars['currencies'].push({'name':'USD', 'one_usd_buys':1});

                /**
                 * Emit to client
                 */
                socket.emit('fixerio', vars['currencies']);
            } else {
                console.log('HTTPS_fixerio()', error);
            }
        });
    }

    /**
     * Latest BTC value in USD from Bistamp. Returns JSON dictionary like https://www.bitstamp.net/api/ticker/, but calculated values are from within an hour
     */
    function HTTPS_bitstamp() {
        request('https://www.bitstamp.net/api/ticker_hour/', function(error, response, body) {
            if (!error) {
                btc = JSON.parse(body);

                /**
                 * Update price for 1 BTC in local currency
                 */
                for (var key in vars['currencies']) {
                    vars['currencies'][key]['btc'] = vars['currencies'][key]['one_usd_buys'] * btc['last'];
                }
            } else {
                console.log('HTTPS_bitstamp()', error);
            }
        });
    }

    /**
     * Get last 200 trades from Poloniex
     */
    function HTTPS_poloniextradehistory() {
        request('https://poloniex.com/public?command=returnTradeHistory&currencyPair=BTC_VNL', function(error, response, body) {
            if (!error) {
                /**
                 * Make sure that response content-type is JSON
                 */
                if (response['headers']['content-type'] == 'application/json') {
                    body = JSON.parse(body);

                    /**
                     * body will evalute to true if value is not: null, undefined, NaN, empty string (""), 0, false
                     */
                    if (body) {
                        vars['vnl_poloniex'] = parseFloat(body[0]['rate']);
                        socket.emit('poloniextradehistory', body);
                    }
                } else {
                    console.log('HTTPS_poloniextradehistory() incorrect response content-type. Headers: ', response['headers']);
                }
            } else {
                console.log('HTTPS_poloniextradehistory()', error);
            }
        });
    }

    /**
     * Get last 50 trades from Bittrex
     */
    function HTTPS_bittrextradehistory() {
        request('https://bittrex.com/api/v1.1/public/getmarkethistory?market=BTC-VNL&count=50', function(error, response, body) {
            if (!error) {
                /**
                 * Make sure that response content-type is JSON
                 */
                if (response['headers']['content-type'] == 'application/json; charset=utf-8') {
                    body = JSON.parse(body);
                    body = body.result;

                    /**
                     * body will evalute to true if value is not: null, undefined, NaN, empty string (""), 0, false
                     */
                    if (body) {
                        vars['vnl_bittrex'] = parseFloat(body[0]['Price']);
                        socket.emit('bittrextradehistory', body);
                    }
                } else {
                    console.log('HTTPS_bittrextradehistory() incorrect response content-type. Headers: ', response['headers']);
                }
            } else {
                console.log('HTTPS_bittrextradehistory()', error);
            }
        });
    }

    /**
     * Get and set balances then emit the updated array
     */
    function HTTPS_getwatchaddresses() {
        /**
         * Set balance for the provided address
         */
        function setBalance(address) {
            for (key in vars['watch_addresses']) {
                if (vars['watch_addresses'][key]['address'] == address) {
                    vars['watch_addresses'][key]['balance'] = balance;
                    break;
                }
            }
        }

        /**
         * Get balance of the provided address
         */
        function getBalance(address) {
            var request = https.get('https://blockchain.vanillacoin.net/ext/getbalance/$address'.replace('$address', address), function(res) {
                res.on('data', function(obj) {
                    /**
                     * Make sure that the response is a valid float number
                     * Since NaN is the only JavaScript value that is treated as unequal to itself, you can always test if a value is NaN by checking it for equality to itself
                     */
                    if (!(parseFloat(obj.toString('utf8')) !== parseFloat(obj.toString('utf8')))) {
                        parsedObj = JSON.parse(obj);

                        if (parsedObj.error) {
                            balance = 0;
                        } else {
                            balance = parsedObj;
                        }

                        setBalance(address);
                    }
                });
            });

            request.on('error', function(err) {
                console.log('ERR getBalance', err);
            });
        }

        for (key in vars['watch_addresses']) {
            if (!vars['watch_addresses'][key].hasOwnProperty('balance')) {
                vars['watch_addresses'][key]['balance'] = 'Updating...';
            }

            getBalance(vars['watch_addresses'][key]['address']);
        }

        /**
         * Emit the array with 'Updating...' as balances on first load
         */
        socket.emit('watchaddresses', vars['watch_addresses']);

        /**
         * Emit it again after 1 second when balances (should) update. Increase this timeout if you've added a lot of watch-only addresses
         */
        setTimeout(function() {
            socket.emit('watchaddresses', vars['watch_addresses']);
        }, 1000);
    }

    /**
     * RPC method 'listreceivedbyaddress' params 'minconf:1, includeempty:true'
     */
    function RPC_listreceivedbyaddress() {
        client.call({"jsonrpc": "2.0", "method": "listreceivedbyaddress", "params": {"minconf":1,"includeempty":true}, "id": 0}, function(err, res) {
            if (err) { console.log(err); }
            socket.emit('listreceivedbyaddress', res.result);
        });
    }

    /**
     * RPC method 'walletpassphrase' without params. Returns error codes needed on client
     */
    function RPC_walletpassphrase() {
        client.call({"jsonrpc": "2.0", "method": "walletpassphrase", "params": [], "id": 0}, function(err, res) {
            if (err) { console.log(err); }
            socket.emit('wallet_passphrase_check', res.error);
        });
    }

    /**
     * RPC method 'listsinceblock'
     */
    function RPC_listsinceblock() {
        client.call({"jsonrpc": "2.0", "method": "listsinceblock", "params": [], "id": 0}, function(err, res) {
            if (err) { console.log(err); }
            socket.emit('listsinceblock', res.result.transactions);
        });
    }

    /**
     * Check wallet state (locked, unlocked, unencrypted) when a client connects
     */
    RPC_walletpassphrase();

    /**
     * Get current foreign exchange rates published by the European Central Bank. Updated daily
     */
    HTTPS_fixerio();

    /**
     * Update exchange trade histories when a client connects and after that every minute
     */
    (function update() {
        HTTPS_poloniextradehistory();
        HTTPS_bittrextradehistory();

        setTimeout(update, 60000);
    })();

    /**
     * Update watch address data when a client connects and after that every 15 minutes
     */
    (function update() {
        HTTPS_getwatchaddresses();

        setTimeout(update, 900000);
    })();

    /**
     * Update local currencies with default values (0)
     */
    update_prices(vars['local_currency']);

    /**
     * Update prices to local currency set in nconf 2 seconds after client connects and after that every minute
     */
    setTimeout(function() {
        (function update() {
            update_prices(vars['local_currency']);
            setTimeout(update, 60000);
        })();

        RPC_listreceivedbyaddress();
        RPC_listsinceblock();
        socket.emit('watchaddresses', vars['watch_addresses']);
    }, 2000);

    /**
     * Update price for 1 BTC in local currency 1 second after client connects and after that every hour
     */
    setTimeout(function() {
        (function update() {
            HTTPS_bitstamp();

            setTimeout(update, 3600000);
        })();
    }, 1000);

    /**
     * Update local data when a client connects and after that every 10 seconds
     */
    (function update() {
        /**
         * Read and emit UDP connections from debug.log (only on linux)
         */
        if (process.platform == "linux") {
            var exec = require('child_process').exec
            child = exec("tail -300 ~/.Vanillacoin/data/debug.log | grep UDP | tail -1 | sed 's/[^0-9]//g'", function(error, stdout, stderr) {
                socket.emit('udp_connections', stdout);

                if (error !== null) {
                    console.log('exec error: ' + error);
                    console.log('stderr: ' + stderr);
                }
            });
        } else {
            socket.emit('udp_connections', '/');
        }

        /**
         * RPC method 'getinfo'
         */
        client.call({"jsonrpc": "2.0", "method": "getinfo", "params": [], "id": 0}, function(err, res) {
            if (err) { console.log(err); }
            socket.emit('getinfo', res.result);
        });

        /**
         * RPC method 'getincentiveinfo'
         */
        client.call({"jsonrpc": "2.0", "method": "getincentiveinfo", "params": [], "id": 0}, function(err, res) {
            if (err) { console.log(err); }
            socket.emit('getincentiveinfo', res.result);
        });

        /**
         * RPC method 'getpeerinfo'
         */
        client.call({"jsonrpc": "2.0", "method": "getpeerinfo", "params": [], "id": 0}, function(err, res) {
            if (err) { console.log(err); }
            socket.emit('getpeerinfo', res.result);
        });

        RPC_listsinceblock();
        RPC_listreceivedbyaddress();

        setTimeout(update, 10000);
    })();
});

/**
 * GET home page
 */
router.get('/', function(req, res, next) {
    res.render('index', {title: 'vanillacoind-web-ui'});
});

module.exports = router;
