DROP TABLE IF EXISTS `employee`;

CREATE TABLE `employee` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `empNo` varchar(20) NOT NULL,
    `empName` varchar(100) NOT NULL,
    `empDeptName` varchar(100) NOT NULL,
    `empTelNo` varchar(100) NOT NULL,
    `empMail` varchar(100) NOT NULL,
    `createdDate` datetime(6) NOT NULL DEFAULT now(),
    `updateDate` datetime(6) NOT NULL DEFAULT now(),
    PRIMARY KEY (`id`),
    UNIQUE KEY `empNo` (`empNo`)
) DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS `logout`;

CREATE TABLE IF NOT EXISTS `logout` (
  `id` varchar(50) NOT NULL COMMENT '아이디',
  `token` varchar(1500) NOT NULL COMMENT '토큰',
  PRIMARY KEY (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8 COMMENT='로그아웃';

DROP TABLE IF EXISTS `ldap_keystore`;

CREATE TABLE IF NOT EXISTS `ldap_keystore` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pub_key` varchar(1500) NOT NULL,
  `priv_key` varchar(2000) NOT NULL,
  `key_timestamp` bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=utf8;